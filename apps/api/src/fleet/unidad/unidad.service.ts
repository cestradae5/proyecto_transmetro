import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import { AUDIT_RESULTS } from "../../authentication/entities/audit-log.entity.js";
import { EmployeeEntity } from "../../authentication/entities/employee.entity.js";
import { AuditRepository } from "../../authentication/infrastructure/audit.repository.js";
import { LineaService } from "../../infrastructure/linea/linea.service.js";
import { ParqueoService } from "../../infrastructure/parqueo/parqueo.service.js";
import { FLEET_AUDIT_ACTIONS, FLEET_MODULE } from "../shared/fleet.constants.js";
import {
  DuplicatePlate,
  EnServicioRequiresBothAssignments,
  UnitCannotBeCreatedEnServicio,
  UnitNotFound,
} from "../shared/fleet.errors.js";
import { CreateUnidadDto } from "./dto/create-unidad.dto.js";
import { UnidadResponseDto } from "./dto/unidad-response.dto.js";
import { UpdateUnidadDto } from "./dto/update-unidad.dto.js";
import { EstadoUnidad, UnidadEntity } from "./unidad.entity.js";

// Any object exposing TypeORM's raw `query(sql, params)` — satisfied by both
// `DataSource` (non-transactional reads) and `EntityManager` (reads/writes
// inside a transaction). Lets findLineAssignment/findPilotAssignment run in
// either context without duplicating the query.
interface Queryable {
  query(sql: string, parameters?: unknown[]): Promise<unknown[]>;
}

interface LineAssignmentRow {
  idLinea: string;
}

interface PilotAssignmentRow {
  idEmpleado: string;
}

@Injectable()
export class UnidadService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly auditRepo: AuditRepository,
    private readonly lineaService: LineaService,
    private readonly parqueoService: ParqueoService,
  ) {}

  async create(dto: CreateUnidadDto, actorEmployeeId: string): Promise<UnidadResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const unidadRepo = manager.getRepository(UnidadEntity);

      const plateTaken = await unidadRepo.existsBy({ numeroPlaca: dto.numeroPlaca });
      if (plateTaken) {
        throw new DuplicatePlate(dto.numeroPlaca);
      }

      // Spec: "Attempt to create directly as EN_SERVICIO" — a new unit has
      // no assignments yet, so any explicit non-DISPONIBLE state is rejected.
      if (dto.estadoUnidad && dto.estadoUnidad !== EstadoUnidad.DISPONIBLE) {
        throw new UnitCannotBeCreatedEnServicio();
      }

      const now = new Date();
      const entity = unidadRepo.create({
        numeroPlaca: dto.numeroPlaca,
        marca: dto.marca,
        modelo: dto.modelo,
        anio: dto.anio,
        capacidadPasajeros: dto.capacidadPasajeros,
        estadoUnidad: EstadoUnidad.DISPONIBLE,
        fechaRegistro: now,
        fechaActualizacion: now,
      });
      const saved = await unidadRepo.save(entity);

      const actor = await manager
        .getRepository(EmployeeEntity)
        .findOneOrFail({ where: { id: actorEmployeeId } });
      await this.auditRepo.create(manager, {
        action: FLEET_AUDIT_ACTIONS.CREATE,
        employee: actor,
        entityId: saved.id,
        entityType: "unidad",
        module: FLEET_MODULE,
        result: AUDIT_RESULTS.SUCCESS,
        detalle: {
          numeroPlaca: saved.numeroPlaca,
          marca: saved.marca,
          modelo: saved.modelo,
          anio: saved.anio,
          capacidadPasajeros: saved.capacidadPasajeros,
          estadoUnidad: saved.estadoUnidad,
        },
      });

      return this.toResponseDto(saved, manager);
    });
  }

  async update(
    id: string,
    dto: UpdateUnidadDto,
    actorEmployeeId: string,
  ): Promise<UnidadResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const unidadRepo = manager.getRepository(UnidadEntity);

      const unit = await unidadRepo.findOne({ where: { id } });
      if (!unit) {
        throw new UnitNotFound(id);
      }

      // Cross-cutting rule (spec "Unit State Transitions and EN_SERVICIO
      // Validation"): a unit may only transition to EN_SERVICIO when it has
      // BOTH an active line assignment AND an active pilot assignment. The
      // AsignacionUnidadEntity/AsignacionPilotoEntity TypeORM entities don't
      // exist until Slices 3/4, but their tables (tbl_asignacion_unidad,
      // tbl_asignacion_piloto) are already part of the baseline schema
      // (database/init.sql). Querying them directly via the transaction
      // manager's raw `query()` enforces the real rule now, without
      // importing entities that belong to a later slice, and the check
      // keeps working unchanged once those entities are added.
      if (dto.estadoUnidad === EstadoUnidad.EN_SERVICIO) {
        const [lineAssignment, pilotAssignment] = await Promise.all([
          this.findLineAssignment(manager, id),
          this.findPilotAssignment(manager, id),
        ]);
        if (!lineAssignment || !pilotAssignment) {
          throw new EnServicioRequiresBothAssignments();
        }
      }

      const { before, after } = this.buildUpdateDetalle(unit, dto);

      Object.assign(unit, dto);
      unit.fechaActualizacion = new Date();
      const saved = await unidadRepo.save(unit);

      const actor = await manager
        .getRepository(EmployeeEntity)
        .findOneOrFail({ where: { id: actorEmployeeId } });
      await this.auditRepo.create(manager, {
        action: FLEET_AUDIT_ACTIONS.UPDATE,
        employee: actor,
        entityId: saved.id,
        entityType: "unidad",
        module: FLEET_MODULE,
        result: AUDIT_RESULTS.SUCCESS,
        detalle: { before, after },
      });

      return this.toResponseDto(saved, manager);
    });
  }

  async remove(id: string, actorEmployeeId: string): Promise<UnidadResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const unidadRepo = manager.getRepository(UnidadEntity);

      const unit = await unidadRepo.findOne({ where: { id } });
      if (!unit) {
        throw new UnitNotFound(id);
      }

      // Logical removal only. Per spec's own delivery note, this does NOT
      // cascade-unassign the unit's line/pilot assignments — unassignment
      // is a separate operation with its own EN_SERVICIO blocking rule.
      const estadoAnterior = unit.estadoUnidad;
      unit.estadoUnidad = EstadoUnidad.FUERA_DE_SERVICIO;
      unit.fechaActualizacion = new Date();
      const saved = await unidadRepo.save(unit);

      const actor = await manager
        .getRepository(EmployeeEntity)
        .findOneOrFail({ where: { id: actorEmployeeId } });
      await this.auditRepo.create(manager, {
        action: FLEET_AUDIT_ACTIONS.REMOVE,
        employee: actor,
        entityId: saved.id,
        entityType: "unidad",
        module: FLEET_MODULE,
        result: AUDIT_RESULTS.SUCCESS,
        detalle: { estadoAnterior },
      });

      return this.toResponseDto(saved, manager);
    });
  }

  async findOne(id: string): Promise<UnidadResponseDto> {
    const unit = await this.dataSource.getRepository(UnidadEntity).findOne({ where: { id } });
    if (!unit) {
      throw new UnitNotFound(id);
    }
    return this.toResponseDto(unit, this.dataSource);
  }

  async findAll(): Promise<UnidadResponseDto[]> {
    const units = await this.dataSource.getRepository(UnidadEntity).find();
    return Promise.all(units.map((unit) => this.toResponseDto(unit, this.dataSource)));
  }

  // Builds the `{ before, after }` audit detalle shape (design.md Decision 4),
  // limited to the fields actually present (and therefore changed) in the
  // PATCH payload — never the full entity.
  private buildUpdateDetalle(
    before: UnidadEntity,
    dto: UpdateUnidadDto,
  ): { before: Record<string, unknown>; after: Record<string, unknown> } {
    const changedKeys = (Object.keys(dto) as (keyof UpdateUnidadDto)[]).filter(
      (key) => dto[key] !== undefined,
    );

    const beforeDetail: Record<string, unknown> = {};
    const afterDetail: Record<string, unknown> = {};
    for (const key of changedKeys) {
      beforeDetail[key] = before[key as keyof UnidadEntity];
      afterDetail[key] = dto[key];
    }

    return { before: beforeDetail, after: afterDetail };
  }

  // Raw-SQL lookups against tbl_asignacion_unidad/tbl_asignacion_piloto
  // (design.md Decision 8 + this slice's explicit cross-slice resolution).
  // Both tables are part of the original database/init.sql baseline; only
  // their TypeORM entities are Slice 3/4 artifacts, so querying the tables
  // directly (never importing the not-yet-existing entities) is safe and
  // stays correct once those entities are added.
  private async findLineAssignment(
    queryable: Queryable,
    unitId: string,
  ): Promise<LineAssignmentRow | null> {
    const rows = (await queryable.query(
      `SELECT id_linea AS "idLinea" FROM tbl_asignacion_unidad WHERE id_unidad = $1`,
      [unitId],
    )) as LineAssignmentRow[];
    return rows[0] ?? null;
  }

  private async findPilotAssignment(
    queryable: Queryable,
    unitId: string,
  ): Promise<PilotAssignmentRow | null> {
    const rows = (await queryable.query(
      `SELECT id_empleado AS "idEmpleado" FROM tbl_asignacion_piloto WHERE id_unidad = $1`,
      [unitId],
    )) as PilotAssignmentRow[];
    return rows[0] ?? null;
  }

  // Composes the full response shape, including the derived idLinea/parqueo
  // (design.md Decision 8) and idEmpleadoPiloto fields when the unit has
  // active assignments. `queryable` is the transaction manager for
  // create/update/remove (so the assignment lookup sees the same
  // transaction) or the DataSource for the non-transactional findOne/findAll
  // reads.
  private async toResponseDto(
    unit: UnidadEntity,
    queryable: Queryable,
  ): Promise<UnidadResponseDto> {
    const [lineAssignment, pilotAssignment] = await Promise.all([
      this.findLineAssignment(queryable, unit.id),
      this.findPilotAssignment(queryable, unit.id),
    ]);

    const response: UnidadResponseDto = {
      idUnidad: unit.id,
      numeroPlaca: unit.numeroPlaca,
      marca: unit.marca,
      modelo: unit.modelo,
      anio: unit.anio,
      capacidadPasajeros: unit.capacidadPasajeros,
      estadoUnidad: unit.estadoUnidad,
      fechaRegistro: unit.fechaRegistro,
      fechaActualizacion: unit.fechaActualizacion,
    };

    if (lineAssignment) {
      response.idLinea = lineAssignment.idLinea;
      const linea = await this.lineaService.findOne(lineAssignment.idLinea);
      response.parqueo = await this.parqueoService.findOne(linea.idParqueo);
    }

    if (pilotAssignment) {
      response.idEmpleadoPiloto = pilotAssignment.idEmpleado;
    }

    return response;
  }
}
