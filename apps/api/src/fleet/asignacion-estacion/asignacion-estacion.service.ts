import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, type EntityManager } from "typeorm";

import { AUDIT_RESULTS } from "../../authentication/entities/audit-log.entity.js";
import {
  EMPLOYEE_STATUSES,
  EmployeeEntity,
} from "../../authentication/entities/employee.entity.js";
import { AuditRepository } from "../../authentication/infrastructure/audit.repository.js";
import { EstacionEntity } from "../../infrastructure/estacion/estacion.entity.js";
import { EstadoAsignacionLinea } from "../../infrastructure/estacion/estacion-linea.entity.js";
import { FLEET_AUDIT_ACTIONS, FLEET_MODULE, ROLE_CODES } from "../shared/fleet.constants.js";
import {
  AssignmentNotFound,
  EmployeeNotFound,
  EmployeeNotStationOperator,
  OperatorAlreadyAssigned,
  StationNotFound,
} from "../shared/fleet.errors.js";
import { PilotEligibilityLookup } from "../shared/pilot-eligibility.lookup.js";
import { AsignacionEstacionEntity, ESTADO_ASIGNACION } from "./asignacion-estacion.entity.js";
import type {
  AsignacionEstacionLineaDto,
  AsignacionEstacionResponseDto,
} from "./dto/asignacion-estacion-response.dto.js";
import type { CreateAsignacionEstacionDto } from "./dto/create-asignacion-estacion.dto.js";
import type { UpdateAsignacionEstacionDto } from "./dto/update-asignacion-estacion.dto.js";

interface AssignmentRow {
  idAsignacionEstacion: string;
  idEmpleado: string;
  nombreEmpleado: string;
  idEstacion: string;
  nombreEstacion: string;
  estadoAsignacion: string;
  fechaAsignacion: Date;
}

// Station-operator assignment. Invariants (enforced here, not by the DB):
//   - an operator has at most ONE ACTIVA row;
//   - several operators may share a station;
//   - unassign sets INACTIVA and keeps the row (history).
//
// Re-assigning an operator who only has INACTIVA rows INSERTS a new ACTIVA
// row instead of reactivating the old one: every assignment period stays an
// immutable history record with its own fechaAsignacion. Reassign (PATCH)
// does move the same ACTIVA row to another station, as required.
@Injectable()
export class AsignacionEstacionService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly auditRepo: AuditRepository,
    private readonly eligibilityLookup: PilotEligibilityLookup,
  ) {}

  // ACTIVA assignments only, optionally filtered by station.
  async list(idEstacion?: string): Promise<AsignacionEstacionResponseDto[]> {
    const qb = this.dataSource
      .getRepository(AsignacionEstacionEntity)
      .createQueryBuilder("asignacion")
      .innerJoin(EmployeeEntity, "employee", "employee.id = asignacion.idEmpleado")
      .innerJoin(EstacionEntity, "estacion", "estacion.idEstacion = asignacion.idEstacion")
      .select("asignacion.id", "idAsignacionEstacion")
      .addSelect("asignacion.idEmpleado", "idEmpleado")
      .addSelect("employee.name", "nombreEmpleado")
      .addSelect("asignacion.idEstacion", "idEstacion")
      .addSelect("estacion.nombreEstacion", "nombreEstacion")
      .addSelect("asignacion.estadoAsignacion", "estadoAsignacion")
      .addSelect("asignacion.fechaAsignacion", "fechaAsignacion")
      .where("asignacion.estadoAsignacion = :activa", { activa: ESTADO_ASIGNACION.ACTIVA });

    if (idEstacion) {
      qb.andWhere("asignacion.idEstacion = :idEstacion", { idEstacion });
    }

    const rows = await qb.orderBy("employee.name", "ASC").getRawMany<AssignmentRow>();
    const lineas = await this.findStationLines(rows.map((row) => String(row.idEstacion)));
    return rows.map((row) => ({
      idAsignacionEstacion: String(row.idAsignacionEstacion),
      idEmpleado: String(row.idEmpleado),
      nombreEmpleado: row.nombreEmpleado,
      idEstacion: String(row.idEstacion),
      nombreEstacion: row.nombreEstacion,
      estadoAsignacion: row.estadoAsignacion,
      fechaAsignacion: row.fechaAsignacion,
      lineas: lineas.get(String(row.idEstacion)) ?? [],
    }));
  }

  // ACTIVA lines of each station, in one query. The operator's lines are
  // always the station's lines (read-only here; managed in Infrastructure).
  private async findStationLines(
    stationIds: string[],
  ): Promise<Map<string, AsignacionEstacionLineaDto[]>> {
    const byStation = new Map<string, AsignacionEstacionLineaDto[]>();
    if (stationIds.length === 0) return byStation;
    const rows = (await this.dataSource.query(
      `SELECT el.id_estacion AS "idEstacion",
              l.id_linea AS "idLinea",
              l.numero_linea AS "numeroLinea",
              l.nombre_linea AS "nombreLinea"
         FROM tbl_estacion_linea el
        INNER JOIN tbl_linea l ON l.id_linea = el.id_linea
        WHERE el.id_estacion = ANY($1::bigint[]) AND el.estado_asignacion = $2
        ORDER BY l.numero_linea ASC, l.id_linea ASC`,
      [[...new Set(stationIds)], EstadoAsignacionLinea.ACTIVA],
    )) as (AsignacionEstacionLineaDto & { idEstacion: string })[];
    for (const row of rows) {
      const key = String(row.idEstacion);
      const list = byStation.get(key) ?? [];
      list.push({
        idLinea: String(row.idLinea),
        numeroLinea: String(row.numeroLinea),
        nombreLinea: String(row.nombreLinea),
      });
      byStation.set(key, list);
    }
    return byStation;
  }

  async assign(
    dto: CreateAsignacionEstacionDto,
    actorEmployeeId: string,
  ): Promise<AsignacionEstacionResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const station = await this.requireStation(manager, dto.idEstacion);
      const operator = await this.validateOperator(manager, dto.idEmpleado);

      const repo = manager.getRepository(AsignacionEstacionEntity);
      // Pessimistic lock closes the check-then-insert race (same precedent as
      // AsignacionPilotoService.assign).
      const active = await repo.findOne({
        where: { idEmpleado: dto.idEmpleado, estadoAsignacion: ESTADO_ASIGNACION.ACTIVA },
        lock: { mode: "pessimistic_write" },
      });
      if (active) {
        throw new OperatorAlreadyAssigned();
      }

      const saved = await repo.save(
        repo.create({
          idEmpleado: dto.idEmpleado,
          idEstacion: dto.idEstacion,
          estadoAsignacion: ESTADO_ASIGNACION.ACTIVA,
          fechaAsignacion: new Date(),
        }),
      );

      await this.writeAudit(manager, actorEmployeeId, FLEET_AUDIT_ACTIONS.ASSIGN_STATION, saved.id, {
        idEmpleadoOperador: dto.idEmpleado,
        idEstacion: dto.idEstacion,
      });

      return this.toResponseDto(saved, operator.name, station.nombreEstacion);
    });
  }

  async reassign(
    id: string,
    dto: UpdateAsignacionEstacionDto,
    actorEmployeeId: string,
  ): Promise<AsignacionEstacionResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AsignacionEstacionEntity);
      const assignment = await repo.findOne({
        where: { id, estadoAsignacion: ESTADO_ASIGNACION.ACTIVA },
        lock: { mode: "pessimistic_write" },
      });
      if (!assignment) {
        throw new AssignmentNotFound(id);
      }

      const station = await this.requireStation(manager, dto.idEstacion);
      const employee = await manager
        .getRepository(EmployeeEntity)
        .findOne({ where: { id: assignment.idEmpleado } });
      const employeeName = employee?.name ?? "";

      // Same station: idempotent no-op, no write and no audit row.
      if (String(assignment.idEstacion) === String(dto.idEstacion)) {
        return this.toResponseDto(assignment, employeeName, station.nombreEstacion);
      }

      const idEstacionAnterior = assignment.idEstacion;
      assignment.idEstacion = dto.idEstacion;
      const saved = await repo.save(assignment);

      await this.writeAudit(manager, actorEmployeeId, FLEET_AUDIT_ACTIONS.REASSIGN_STATION, id, {
        idEmpleadoOperador: assignment.idEmpleado,
        idEstacionAnterior,
        idEstacionNueva: dto.idEstacion,
      });

      return this.toResponseDto(saved, employeeName, station.nombreEstacion);
    });
  }

  // Soft unassign: marks the row INACTIVA, never deletes it.
  async unassign(id: string, actorEmployeeId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AsignacionEstacionEntity);
      const assignment = await repo.findOne({
        where: { id, estadoAsignacion: ESTADO_ASIGNACION.ACTIVA },
      });
      if (!assignment) {
        throw new AssignmentNotFound(id);
      }

      assignment.estadoAsignacion = ESTADO_ASIGNACION.INACTIVA;
      await repo.save(assignment);

      await this.writeAudit(manager, actorEmployeeId, FLEET_AUDIT_ACTIONS.UNASSIGN_STATION, id, {
        idEmpleadoOperador: assignment.idEmpleado,
        idEstacion: assignment.idEstacion,
      });
    });
  }

  private async requireStation(manager: EntityManager, idEstacion: string): Promise<EstacionEntity> {
    const station = await manager
      .getRepository(EstacionEntity)
      .findOne({ where: { idEstacion: idEstacion as unknown as number } });
    if (!station) {
      throw new StationNotFound(idEstacion);
    }
    return station;
  }

  // EmployeeNotFound (404) when absent; EmployeeNotStationOperator (409) when
  // the role is not OPERADOR_ESTACION or the employee is not active.
  private async validateOperator(
    manager: EntityManager,
    employeeId: string,
  ): Promise<{ id: string; name: string }> {
    const eligibility = await this.eligibilityLookup.findRoleCode(manager, employeeId);
    if (!eligibility) {
      throw new EmployeeNotFound(employeeId);
    }
    if (eligibility.roleCode !== ROLE_CODES.OPERADOR_ESTACION) {
      throw new EmployeeNotStationOperator();
    }
    const employee = await manager
      .getRepository(EmployeeEntity)
      .findOne({ where: { id: employeeId } });
    if (!employee) {
      throw new EmployeeNotFound(employeeId);
    }
    if (employee.status !== EMPLOYEE_STATUSES.ACTIVE) {
      throw new EmployeeNotStationOperator();
    }
    return { id: employee.id, name: employee.name };
  }

  private async writeAudit(
    manager: EntityManager,
    actorEmployeeId: string,
    action: string,
    assignmentId: string,
    detalle: Record<string, unknown>,
  ): Promise<void> {
    const actor = await manager
      .getRepository(EmployeeEntity)
      .findOneOrFail({ where: { id: actorEmployeeId } });
    await this.auditRepo.create(manager, {
      action,
      employee: actor,
      entityId: assignmentId,
      entityType: "asignacion_estacion",
      module: FLEET_MODULE,
      result: AUDIT_RESULTS.SUCCESS,
      detalle,
    });
  }

  private toResponseDto(
    assignment: AsignacionEstacionEntity,
    nombreEmpleado: string,
    nombreEstacion: string,
  ): AsignacionEstacionResponseDto {
    return {
      idAsignacionEstacion: assignment.id,
      idEmpleado: assignment.idEmpleado,
      nombreEmpleado,
      idEstacion: String(assignment.idEstacion),
      nombreEstacion,
      estadoAsignacion: assignment.estadoAsignacion,
      fechaAsignacion: assignment.fechaAsignacion,
    };
  }
}
