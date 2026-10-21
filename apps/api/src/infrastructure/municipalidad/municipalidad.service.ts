import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import {
  EstadoMunicipalidad,
  MunicipalidadEntity,
} from "./municipalidad.entity.js";
import { CreateMunicipalidadDto } from "./dto/create-municipalidad.dto.js";
import { UpdateMunicipalidadDto } from "./dto/update-municipalidad.dto.js";
import { MunicipalidadResponseDto } from "./dto/municipalidad-response.dto.js";
import { InfrastructureAuditService } from "../shared/infrastructure-audit.service.js";
import { AfectacionService } from "../afectacion/afectacion.service.js";
import { AccionAfectacion } from "../afectacion/afectacion.entity.js";
import {
  INFRASTRUCTURE_AUDIT_ACTIONS,
  INFRASTRUCTURE_ENTITY_TYPES,
} from "../shared/infrastructure-audit.constants.js";

const PG_UNIQUE_VIOLATION = "23505";

const MOTIVO_DESACTIVADA = "Desactivada desde Municipalidades";
const MOTIVO_ACTIVADA = "Activada desde Municipalidades";

/** Today as YYYY-MM-DD in the server's local time zone. */
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** True when `error` is a Postgres unique violation surfaced by TypeORM. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code ===
      PG_UNIQUE_VIOLATION
  );
}

@Injectable()
export class MunicipalidadService {
  constructor(
    @InjectRepository(MunicipalidadEntity)
    private readonly municipalidadRepository: Repository<MunicipalidadEntity>,
    private readonly audit: InfrastructureAuditService,
    private readonly afectaciones: AfectacionService
  ) {}

  async create(
    dto: CreateMunicipalidadDto,
    actorEmployeeId: string
  ): Promise<MunicipalidadResponseDto> {
    await this.ensureNombreAvailable(dto.nombreMunicipalidad);

    // The write and its audit row commit or roll back together.
    const saved = await this.municipalidadRepository.manager.transaction(
      async (manager) => {
        const repo = manager.getRepository(MunicipalidadEntity);
        const municipalidad = repo.create({
          ...dto,
          estadoMunicipalidad:
            dto.estadoMunicipalidad ?? EstadoMunicipalidad.ACTIVA,
        });
        const persisted = await this.saveOrConflict(repo, municipalidad);
        await this.audit.record(manager, actorEmployeeId, {
          action: INFRASTRUCTURE_AUDIT_ACTIONS.CREATE,
          entityType: INFRASTRUCTURE_ENTITY_TYPES.MUNICIPALIDAD,
          entityId: persisted.idMunicipalidad,
          detalle: {
            nombreMunicipalidad: persisted.nombreMunicipalidad,
            departamento: persisted.departamento,
            estadoMunicipalidad: persisted.estadoMunicipalidad,
          },
        });
        return persisted;
      }
    );
    return this.toResponseDto(saved);
  }

  async findAll(): Promise<MunicipalidadResponseDto[]> {
    const municipalidades = await this.municipalidadRepository.find({
      order: { nombreMunicipalidad: "ASC" },
    });
    return municipalidades.map((m) => this.toResponseDto(m));
  }

  async findOne(id: string): Promise<MunicipalidadResponseDto> {
    const municipalidad = await this.findOrFail(id);
    return this.toResponseDto(municipalidad);
  }

  async update(
    id: string,
    dto: UpdateMunicipalidadDto,
    actorEmployeeId: string
  ): Promise<MunicipalidadResponseDto> {
    const municipalidad = await this.findOrFail(id);

    if (
      dto.nombreMunicipalidad !== undefined &&
      dto.nombreMunicipalidad !== municipalidad.nombreMunicipalidad
    ) {
      await this.ensureNombreAvailable(dto.nombreMunicipalidad, id);
    }

    const changedFields = Object.keys(dto);
    const nuevoEstado =
      dto.estadoMunicipalidad !== undefined &&
      dto.estadoMunicipalidad !== municipalidad.estadoMunicipalidad
        ? dto.estadoMunicipalidad
        : undefined;
    const updated = await this.municipalidadRepository.manager.transaction(
      async (manager) => {
        // An estado change goes through an afectación, so it cascades to the
        // líneas/paradas like one made from Afectaciones. It runs first: the
        // save below then sees the new estado and leaves it alone.
        if (nuevoEstado !== undefined) {
          const activar = nuevoEstado === EstadoMunicipalidad.ACTIVA;
          await this.afectaciones.aplicar(
            manager,
            {
              accion: activar ? AccionAfectacion.ACTIVAR : AccionAfectacion.DESACTIVAR,
              motivo: activar ? MOTIVO_ACTIVADA : MOTIVO_DESACTIVADA,
              fechaInicio: today(),
              idMunicipalidad: id,
            },
            actorEmployeeId
          );
        }
        const repo = manager.getRepository(MunicipalidadEntity);
        Object.assign(municipalidad, dto);
        const persisted = await this.saveOrConflict(repo, municipalidad);
        await this.audit.record(manager, actorEmployeeId, {
          action: INFRASTRUCTURE_AUDIT_ACTIONS.UPDATE,
          entityType: INFRASTRUCTURE_ENTITY_TYPES.MUNICIPALIDAD,
          entityId: persisted.idMunicipalidad,
          detalle: { changedFields },
        });
        return persisted;
      }
    );
    return this.toResponseDto(updated);
  }

  async remove(id: string, actorEmployeeId: string): Promise<void> {
    const municipalidad = await this.findOrFail(id);

    // Soft delete like the sibling infrastructure modules: the row (and its
    // línea links) is kept and only marked INACTIVA, through a DESACTIVAR
    // afectación so its exclusive líneas, paradas and estaciones go down too.
    // An already INACTIVA municipalidad has nothing left to deactivate.
    await this.municipalidadRepository.manager.transaction(async (manager) => {
      if (municipalidad.estadoMunicipalidad !== EstadoMunicipalidad.INACTIVA) {
        await this.afectaciones.aplicar(
          manager,
          {
            accion: AccionAfectacion.DESACTIVAR,
            motivo: MOTIVO_DESACTIVADA,
            fechaInicio: today(),
            idMunicipalidad: id,
          },
          actorEmployeeId
        );
      }
      await this.audit.record(manager, actorEmployeeId, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.REMOVE,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.MUNICIPALIDAD,
        entityId: id,
        detalle: { nombreMunicipalidad: municipalidad.nombreMunicipalidad },
      });
    });
  }

  private async findOrFail(id: string): Promise<MunicipalidadEntity> {
    const municipalidad = await this.municipalidadRepository.findOne({
      where: { idMunicipalidad: id },
    });
    if (!municipalidad) {
      throw new NotFoundException(`Municipalidad con ID ${id} no encontrada`);
    }
    return municipalidad;
  }

  private async ensureNombreAvailable(
    nombre: string,
    excludeId?: string
  ): Promise<void> {
    const existing = await this.municipalidadRepository.findOne({
      where: { nombreMunicipalidad: nombre },
    });
    if (existing && existing.idMunicipalidad !== excludeId) {
      throw this.duplicateNombre(nombre);
    }
  }

  // The pre-check covers the common case; the unique constraint still guards
  // concurrent writes, so its violation is translated to the same 409.
  private async saveOrConflict(
    repo: Repository<MunicipalidadEntity>,
    municipalidad: MunicipalidadEntity
  ): Promise<MunicipalidadEntity> {
    try {
      return await repo.save(municipalidad);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw this.duplicateNombre(municipalidad.nombreMunicipalidad);
      }
      throw error;
    }
  }

  private duplicateNombre(nombre: string): ConflictException {
    return new ConflictException(
      `Ya existe una municipalidad con el nombre ${nombre}`,
      "MUNICIPALIDAD_NOMBRE_DUPLICATE"
    );
  }

  private toResponseDto(
    municipalidad: MunicipalidadEntity
  ): MunicipalidadResponseDto {
    return {
      idMunicipalidad: municipalidad.idMunicipalidad,
      nombreMunicipalidad: municipalidad.nombreMunicipalidad,
      departamento: municipalidad.departamento,
      estadoMunicipalidad: municipalidad.estadoMunicipalidad,
    };
  }
}
