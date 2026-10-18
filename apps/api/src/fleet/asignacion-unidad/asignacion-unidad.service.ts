import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, type EntityManager, type Repository } from "typeorm";

import { AUDIT_RESULTS } from "../../authentication/entities/audit-log.entity.js";
import { EmployeeEntity } from "../../authentication/entities/employee.entity.js";
import { AuditRepository } from "../../authentication/infrastructure/audit.repository.js";
import { LineaParadaEntity } from "../../infrastructure/linea/linea-parada.entity.js";
import { LineaService } from "../../infrastructure/linea/linea.service.js";
import { FLEET_AUDIT_ACTIONS, FLEET_MODULE } from "../shared/fleet.constants.js";
import {
  LineAssignmentNotFound,
  LineAssignmentUnchanged,
  LineNotFound,
  StopNotFound,
  StopNotInAssignedLine,
  UnitAlreadyHasLineAssignment,
  UnitEnServicioCannotUnassignLine,
  UnitHasNoLineAssignment,
  UnitNotFound,
} from "../shared/fleet.errors.js";
import { EstadoUnidad, UnidadEntity } from "../unidad/unidad.entity.js";
import { AsignacionUnidadEntity } from "./asignacion-unidad.entity.js";
import { AsignacionUnidadResponseDto } from "./dto/asignacion-unidad-response.dto.js";
import { CreateAsignacionUnidadDto } from "./dto/create-asignacion-unidad.dto.js";
import type { LineaParadaStopResponseDto } from "./dto/linea-parada-stop-response.dto.js";
import { ReportLocationDto } from "./dto/report-location.dto.js";
import { UpdateAsignacionUnidadDto } from "./dto/update-asignacion-unidad.dto.js";

// Unit-to-line assignment lifecycle (design.md task 3.2.3): assign,
// reassign, unassign, and central-operator location report/correction.
// Every mutation follows the same dataSource.transaction()/
// manager.getRepository() shape as UnidadService (design.md Decision 5) —
// never a constructor-injected repository inside the transaction.
@Injectable()
export class AsignacionUnidadService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly auditRepo: AuditRepository,
    private readonly lineaService: LineaService,
  ) {}

  async assign(
    unitId: string,
    dto: CreateAsignacionUnidadDto,
    actorEmployeeId: string,
  ): Promise<AsignacionUnidadResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const unit = await manager.getRepository(UnidadEntity).findOne({ where: { id: unitId } });
      if (!unit) {
        throw new UnitNotFound(unitId);
      }

      await this.ensureLineExists(dto.idLinea);

      const repo = manager.getRepository(AsignacionUnidadEntity);
      const existing = await repo.findOne({ where: { idUnidad: unitId } });
      if (existing) {
        throw new UnitAlreadyHasLineAssignment(unitId);
      }

      const now = new Date();
      const saved = await repo.save(
        repo.create({
          idUnidad: unitId,
          idLinea: dto.idLinea,
          fechaAsignacion: now,
          fechaActualizacion: now,
          idLineaParadaActual: null,
          fechaReporteUbicacion: null,
        }),
      );

      await this.writeAudit(manager, actorEmployeeId, FLEET_AUDIT_ACTIONS.ASSIGN_LINE, unitId, {
        idLinea: dto.idLinea,
      });

      return this.toResponseDto(saved);
    });
  }

  async reassign(
    unitId: string,
    dto: UpdateAsignacionUnidadDto,
    actorEmployeeId: string,
  ): Promise<AsignacionUnidadResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AsignacionUnidadEntity);
      const assignment = await repo.findOne({ where: { idUnidad: unitId } });
      if (!assignment) {
        throw new LineAssignmentNotFound(unitId);
      }

      await this.ensureLineExists(dto.idLinea);

      // No idempotent reassign (spec: explicit state change required to
      // avoid empty audit rows).
      if (assignment.idLinea === dto.idLinea) {
        throw new LineAssignmentUnchanged();
      }

      const idLineaAnterior = assignment.idLinea;
      assignment.idLinea = dto.idLinea;
      // Reassignment always clears the last reported stop — a stop on the
      // old line has no meaning on the new one.
      assignment.idLineaParadaActual = null;
      assignment.fechaReporteUbicacion = null;
      assignment.fechaActualizacion = new Date();
      const saved = await repo.save(assignment);

      await this.writeAudit(manager, actorEmployeeId, FLEET_AUDIT_ACTIONS.REASSIGN_LINE, unitId, {
        idLineaAnterior,
        idLineaNueva: dto.idLinea,
      });

      return this.toResponseDto(saved);
    });
  }

  async unassign(unitId: string, actorEmployeeId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AsignacionUnidadEntity);
      const assignment = await repo.findOne({ where: { idUnidad: unitId } });
      if (!assignment) {
        throw new LineAssignmentNotFound(unitId);
      }

      const unit = await manager.getRepository(UnidadEntity).findOne({ where: { id: unitId } });
      if (unit?.estadoUnidad === EstadoUnidad.EN_SERVICIO) {
        throw new UnitEnServicioCannotUnassignLine();
      }

      const idLineaAnterior = assignment.idLinea;
      await repo.remove(assignment);

      await this.writeAudit(manager, actorEmployeeId, FLEET_AUDIT_ACTIONS.UNASSIGN_LINE, unitId, {
        idLineaAnterior,
      });
    });
  }

  // Central-operator report (task 3.2.3/3.2.4: both /location routes on
  // this slice's controller require FLOTA_GESTIONAR — the pilot
  // self-service POST /fleet/units/my-unit/location is a Slice 4 route).
  async reportLocation(
    unitId: string,
    dto: ReportLocationDto,
    actorEmployeeId: string,
  ): Promise<AsignacionUnidadResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const { repo, assignment } = await this.loadAssignmentForLocation(manager, unitId);
      const stop = await this.validateStopInLine(manager, dto.idLineaParada, assignment.idLinea);

      assignment.idLineaParadaActual = stop.idLineaParada;
      assignment.fechaReporteUbicacion = new Date();
      assignment.fechaActualizacion = new Date();
      const saved = await repo.save(assignment);

      await this.writeAudit(
        manager,
        actorEmployeeId,
        FLEET_AUDIT_ACTIONS.REPORT_LOCATION,
        unitId,
        { idLineaParada: dto.idLineaParada },
      );

      return this.toResponseDto(saved);
    });
  }

  async correctLocation(
    unitId: string,
    dto: ReportLocationDto,
    actorEmployeeId: string,
  ): Promise<AsignacionUnidadResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const { repo, assignment } = await this.loadAssignmentForLocation(manager, unitId);
      const stop = await this.validateStopInLine(manager, dto.idLineaParada, assignment.idLinea);

      const idLineaParadaAnterior = assignment.idLineaParadaActual;
      assignment.idLineaParadaActual = stop.idLineaParada;
      assignment.fechaReporteUbicacion = new Date();
      assignment.fechaActualizacion = new Date();
      const saved = await repo.save(assignment);

      await this.writeAudit(
        manager,
        actorEmployeeId,
        FLEET_AUDIT_ACTIONS.CORRECT_LOCATION,
        unitId,
        { idLineaParadaAnterior, idLineaParadaNueva: dto.idLineaParada },
      );

      return this.toResponseDto(saved);
    });
  }

  // Ordered stops of the unit's assigned line (the same set reportLocation's
  // validateStopInLine accepts). Reads through LineaService.listParadas
  // instead of duplicating the tbl_linea_parada query; its NotFoundException
  // (line row missing, FK-impossible in practice) is re-raised as LineNotFound.
  async listLineStops(unitId: string): Promise<LineaParadaStopResponseDto[]> {
    const assignment = await this.dataSource
      .getRepository(AsignacionUnidadEntity)
      .findOne({ where: { idUnidad: unitId } });
    if (!assignment) {
      throw new UnitHasNoLineAssignment();
    }

    let stops: LineaParadaEntity[];
    try {
      stops = await this.lineaService.listParadas(assignment.idLinea);
    } catch {
      throw new LineNotFound(assignment.idLinea);
    }

    return stops.map((stop) => ({
      idLineaParada: String(stop.idLineaParada),
      idParada: String(stop.idParada),
      nombre: stop.parada?.nombreParada ?? "",
      orden: stop.orden,
      personasEnParada: Number(stop.parada?.personasEnParada ?? 0),
    }));
  }

  // Reuses InfrastructureModule's exported LineaService (design.md
  // Decision 8's read-composition pattern) instead of a duplicate
  // Repository<LineaEntity> FK check — LineaService.findOne() already
  // throws NestJS's NotFoundException when the line does not exist; fleet
  // re-raises it as the domain LineNotFound so DomainExceptionFilter maps
  // it uniformly with every other fleet 404.
  private async ensureLineExists(idLinea: string): Promise<void> {
    try {
      await this.lineaService.findOne(idLinea);
    } catch {
      throw new LineNotFound(idLinea);
    }
  }

  private async loadAssignmentForLocation(
    manager: EntityManager,
    unitId: string,
  ): Promise<{ repo: Repository<AsignacionUnidadEntity>; assignment: AsignacionUnidadEntity }> {
    const repo = manager.getRepository(AsignacionUnidadEntity);
    const assignment = await repo.findOne({ where: { idUnidad: unitId } });
    if (!assignment) {
      throw new UnitHasNoLineAssignment();
    }
    return { repo, assignment };
  }

  private async validateStopInLine(
    manager: EntityManager,
    idLineaParada: string,
    idLinea: string,
  ): Promise<LineaParadaEntity> {
    const stop = await manager
      .getRepository(LineaParadaEntity)
      .findOne({ where: { idLineaParada } });
    if (!stop) {
      throw new StopNotFound(idLineaParada);
    }
    if (stop.idLinea !== idLinea) {
      throw new StopNotInAssignedLine();
    }
    return stop;
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
      // Decision 4: entidad_id is always the unit's id_unidad, even for
      // assignment mutations — the natural query axis is "what happened to
      // unit X", not the assignment row's own PK.
      entityId: unitId,
      entityType: "asignacion_unidad",
      module: FLEET_MODULE,
      result: AUDIT_RESULTS.SUCCESS,
      detalle,
    });
  }

  private toResponseDto(assignment: AsignacionUnidadEntity): AsignacionUnidadResponseDto {
    return {
      id: assignment.id,
      idUnidad: assignment.idUnidad,
      idLinea: assignment.idLinea,
      fechaAsignacion: assignment.fechaAsignacion,
      fechaActualizacion: assignment.fechaActualizacion,
      idLineaParadaActual: assignment.idLineaParadaActual ?? undefined,
      fechaReporteUbicacion: assignment.fechaReporteUbicacion ?? undefined,
    };
  }
}
