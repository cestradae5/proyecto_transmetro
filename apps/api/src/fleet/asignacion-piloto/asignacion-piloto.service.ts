import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, type EntityManager } from "typeorm";

import { AUDIT_RESULTS } from "../../authentication/entities/audit-log.entity.js";
import { EmployeeEntity } from "../../authentication/entities/employee.entity.js";
import { AuditRepository } from "../../authentication/infrastructure/audit.repository.js";
import { AsignacionUnidadService } from "../asignacion-unidad/asignacion-unidad.service.js";
import type { AsignacionUnidadResponseDto } from "../asignacion-unidad/dto/asignacion-unidad-response.dto.js";
import type { LineaParadaStopResponseDto } from "../asignacion-unidad/dto/linea-parada-stop-response.dto.js";
import type { ReportLocationDto } from "../asignacion-unidad/dto/report-location.dto.js";
import { FLEET_AUDIT_ACTIONS, FLEET_MODULE, ROLE_CODES } from "../shared/fleet.constants.js";
import {
  EmployeeNotFound,
  PilotAlreadyAssignedToUnit,
  PilotAssignmentNotFound,
  PilotAssignmentUnchanged,
  PilotHasNoUnitAssigned,
  PilotRoleRequired,
  UnitAlreadyHasPilotAssignment,
  UnitEnServicioCannotReassignPilot,
  UnitEnServicioCannotUnassignPilot,
  UnitNotFound,
} from "../shared/fleet.errors.js";
import { PilotEligibilityLookup } from "../shared/pilot-eligibility.lookup.js";
import type { UnidadResponseDto } from "../unidad/dto/unidad-response.dto.js";
import { EstadoUnidad, UnidadEntity } from "../unidad/unidad.entity.js";
import { UnidadService } from "../unidad/unidad.service.js";
import { AsignacionPilotoEntity } from "./asignacion-piloto.entity.js";
import type { AsignacionPilotoResponseDto } from "./dto/asignacion-piloto-response.dto.js";
import type { CreateAsignacionPilotoDto } from "./dto/create-asignacion-piloto.dto.js";
import type { UpdateAsignacionPilotoDto } from "./dto/update-asignacion-piloto.dto.js";

// reassign()'s operation model (resolves a genuine design.md/tasks.md
// ambiguity, verified against spec.md's "Reassign Pilot to a Different
// Unit" requirement, which is unambiguous across its happy path and all
// three edge-case scenarios):
//
//   PATCH /fleet/units/{unitId}/pilot-assignment moves the pilot named in
//   the body (dto.idEmpleado) FROM their current unit TO :unitId (the
//   TARGET unit) — unlike AsignacionUnidadService.reassign, which replaces
//   the SAME unit's line. The existing assignment row is therefore located
//   by idEmpleado, not by unitId; only its idUnidad and fechaActualizacion
//   change (fechaAsignacion is untouched — it records the original
//   assignment date, not the latest move).
//
// task 4.2.3's literal pseudocode has two bullets that, read against this
// (spec-confirmed) model, do not apply as written and are intentionally not
// implemented literally:
//   - "Check new pilot not assigned to another unit (PilotAlreadyAssignedToUnit)"
//     is redundant here: the assignment we just loaded by idEmpleado IS that
//     pilot's only row by construction (idEmpleado is UNIQUE at the DB
//     level), so there is no separate "another unit" to check.
//   - "Check target unit has no other pilot" is the ONE check from that list
//     that is meaningful under this model — implemented below as the
//     UnitAlreadyHasPilotAssignment check against :unitId.
@Injectable()
export class AsignacionPilotoService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly auditRepo: AuditRepository,
    private readonly pilotEligibilityLookup: PilotEligibilityLookup,
    private readonly unidadService: UnidadService,
    private readonly asignacionUnidadService: AsignacionUnidadService,
  ) {}

  async assign(
    unitId: string,
    dto: CreateAsignacionPilotoDto,
    actorEmployeeId: string,
  ): Promise<AsignacionPilotoResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const unit = await manager.getRepository(UnidadEntity).findOne({ where: { id: unitId } });
      if (!unit) {
        throw new UnitNotFound(unitId);
      }

      const pilot = await this.validatePilotRole(manager, dto.idEmpleado);

      const repo = manager.getRepository(AsignacionPilotoEntity);

      // Pessimistic locks on both cardinality checks (design.md Decision 5;
      // mirrors EmployeeRepository.findEligibleByEmail's existing
      // precedent) close the race window between "check no existing row"
      // and "insert" under concurrent requests.
      const pilotExisting = await repo.findOne({
        where: { idEmpleado: dto.idEmpleado },
        lock: { mode: "pessimistic_write" },
      });
      if (pilotExisting) {
        throw new PilotAlreadyAssignedToUnit();
      }

      const unitExisting = await repo.findOne({
        where: { idUnidad: unitId },
        lock: { mode: "pessimistic_write" },
      });
      if (unitExisting) {
        throw new UnitAlreadyHasPilotAssignment();
      }

      const now = new Date();
      const saved = await repo.save(
        repo.create({
          idEmpleado: dto.idEmpleado,
          idUnidad: unitId,
          fechaAsignacion: now,
          fechaActualizacion: now,
        }),
      );

      await this.writeAudit(manager, actorEmployeeId, FLEET_AUDIT_ACTIONS.ASSIGN_PILOT, unitId, {
        idEmpleadoPiloto: dto.idEmpleado,
      });

      return this.toResponseDto(saved, pilot.name);
    });
  }

  async reassign(
    unitId: string,
    dto: UpdateAsignacionPilotoDto,
    actorEmployeeId: string,
  ): Promise<AsignacionPilotoResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const pilot = await this.validatePilotRole(manager, dto.idEmpleado);

      const repo = manager.getRepository(AsignacionPilotoEntity);

      // See the module-level comment: the assignment to move is located by
      // the pilot's employee id, not by unitId.
      const assignment = await repo.findOne({
        where: { idEmpleado: dto.idEmpleado },
        lock: { mode: "pessimistic_write" },
      });
      if (!assignment) {
        throw new PilotAssignmentNotFound(unitId);
      }

      const targetUnit = await manager
        .getRepository(UnidadEntity)
        .findOne({ where: { id: unitId } });
      if (!targetUnit) {
        throw new UnitNotFound(unitId);
      }

      // No idempotent reassign (mirrors AsignacionUnidadService.reassign's
      // LineAssignmentUnchanged rule — explicit state change required to
      // avoid empty audit rows).
      if (assignment.idUnidad === unitId) {
        throw new PilotAssignmentUnchanged();
      }

      const currentUnit = await manager
        .getRepository(UnidadEntity)
        .findOne({ where: { id: assignment.idUnidad } });
      if (currentUnit?.estadoUnidad === EstadoUnidad.EN_SERVICIO) {
        throw new UnitEnServicioCannotReassignPilot();
      }

      const targetExisting = await repo.findOne({
        where: { idUnidad: unitId },
        lock: { mode: "pessimistic_write" },
      });
      if (targetExisting) {
        throw new UnitAlreadyHasPilotAssignment();
      }

      const idUnidadAnterior = assignment.idUnidad;
      assignment.idUnidad = unitId;
      assignment.fechaActualizacion = new Date();
      const saved = await repo.save(assignment);

      await this.writeAudit(manager, actorEmployeeId, FLEET_AUDIT_ACTIONS.REASSIGN_PILOT, unitId, {
        idEmpleadoPiloto: dto.idEmpleado,
        idUnidadAnterior,
        idUnidadNueva: unitId,
      });

      return this.toResponseDto(saved, pilot.name);
    });
  }

  async unassign(unitId: string, actorEmployeeId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AsignacionPilotoEntity);
      const assignment = await repo.findOne({ where: { idUnidad: unitId } });
      if (!assignment) {
        throw new PilotAssignmentNotFound(unitId);
      }

      const unit = await manager.getRepository(UnidadEntity).findOne({ where: { id: unitId } });
      if (unit?.estadoUnidad === EstadoUnidad.EN_SERVICIO) {
        throw new UnitEnServicioCannotUnassignPilot();
      }

      const idEmpleadoPilotoAnterior = assignment.idEmpleado;
      await repo.remove(assignment);

      await this.writeAudit(manager, actorEmployeeId, FLEET_AUDIT_ACTIONS.UNASSIGN_PILOT, unitId, {
        idEmpleadoPilotoAnterior,
      });
    });
  }

  // Decision 6: scope resolved from employeeId (request.user.employeeId,
  // set by the controller) at query time, never a unit-id route param —
  // structurally eliminates cross-pilot queries.
  async getOwnUnit(employeeId: string): Promise<UnidadResponseDto> {
    const assignment = await this.dataSource
      .getRepository(AsignacionPilotoEntity)
      .findOne({ where: { idEmpleado: employeeId } });
    if (!assignment) {
      throw new PilotHasNoUnitAssigned();
    }
    return this.unidadService.findOne(assignment.idUnidad);
  }

  // Delegates to AsignacionUnidadService.reportLocation (design.md Decision
  // 8/task 4.2.3) so the stop-belongs-to-line and fechaReporteUbicacion
  // logic is not duplicated — only the actor source differs (the pilot's
  // own employeeId, resolved here, never a unit-id route param).
  async reportOwnLocation(
    employeeId: string,
    dto: ReportLocationDto,
  ): Promise<AsignacionUnidadResponseDto> {
    const assignment = await this.dataSource
      .getRepository(AsignacionPilotoEntity)
      .findOne({ where: { idEmpleado: employeeId } });
    if (!assignment) {
      throw new PilotHasNoUnitAssigned();
    }
    return this.asignacionUnidadService.reportLocation(assignment.idUnidad, dto, employeeId);
  }

  // Pilot-scoped read of the stops reportOwnLocation accepts. Same delegation
  // shape as reportOwnLocation: the unit is resolved from the pilot's own
  // employeeId, and AsignacionUnidadService owns the line-assignment lookup.
  async getOwnStops(employeeId: string): Promise<LineaParadaStopResponseDto[]> {
    const assignment = await this.dataSource
      .getRepository(AsignacionPilotoEntity)
      .findOne({ where: { idEmpleado: employeeId } });
    if (!assignment) {
      throw new PilotHasNoUnitAssigned();
    }
    return this.asignacionUnidadService.listLineStops(assignment.idUnidad);
  }

  // Resolves the role-code check (design.md Decision 1/task 4.2.3): throws
  // EmployeeNotFound (404) when PilotEligibilityLookup.findRoleCode returns
  // null (Slice 1 deliberately left that translation to this slice's
  // consumer), and PilotRoleRequired (409) when the employee exists but is
  // not a PILOTO. Also resolves the employee's name for the response DTO
  // (task 4.2.2: "nombre si está disponible") via a second, narrow read —
  // PilotEligibilityLookup only selects role.code, not employee.name, and
  // it is out of this slice's authorized edit scope.
  private async validatePilotRole(
    manager: EntityManager,
    employeeId: string,
  ): Promise<{ id: string; name?: string }> {
    const eligibility = await this.pilotEligibilityLookup.findRoleCode(manager, employeeId);
    if (!eligibility) {
      throw new EmployeeNotFound(employeeId);
    }
    if (eligibility.roleCode !== ROLE_CODES.PILOTO) {
      throw new PilotRoleRequired();
    }
    const employee = await manager
      .getRepository(EmployeeEntity)
      .findOne({ where: { id: employeeId } });
    return { id: eligibility.id, name: employee?.name };
  }

  private async writeAudit(
    manager: EntityManager,
    actorEmployeeId: string,
    action: string,
    unitId: string,
    detalle: Record<string, unknown>,
  ): Promise<void> {
    const actor = await manager
      .getRepository(EmployeeEntity)
      .findOneOrFail({ where: { id: actorEmployeeId } });
    await this.auditRepo.create(manager, {
      action,
      employee: actor,
      // Decision 4: entidad_id is always the unit's id_unidad. For
      // reassign, that is the TARGET unit (:unitId) — the URL's own
      // parameter, matching every other fleet mutation's convention.
      entityId: unitId,
      entityType: "asignacion_piloto",
      module: FLEET_MODULE,
      result: AUDIT_RESULTS.SUCCESS,
      detalle,
    });
  }

  private toResponseDto(
    assignment: AsignacionPilotoEntity,
    nombreEmpleado?: string,
  ): AsignacionPilotoResponseDto {
    return {
      id: assignment.id,
      idEmpleado: assignment.idEmpleado,
      nombreEmpleado,
      idUnidad: assignment.idUnidad,
      fechaAsignacion: assignment.fechaAsignacion,
      fechaActualizacion: assignment.fechaActualizacion,
    };
  }
}
