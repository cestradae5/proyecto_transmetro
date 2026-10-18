import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import { EstacionEntity } from "./estacion.entity.js";
import { CreateEstacionDto } from "./dto/create-estacion.dto.js";
import { UpdateEstacionDto } from "./dto/update-estacion.dto.js";
import { EstacionResponseDto } from "./dto/estacion-response.dto.js";
import { validateForeignKey } from "../shared/validators.js";
import { ParadaEntity } from "../parada/parada.entity.js";
import { InfrastructureAuditService } from "../shared/infrastructure-audit.service.js";
import {
  INFRASTRUCTURE_AUDIT_ACTIONS,
  INFRASTRUCTURE_ENTITY_TYPES,
} from "../shared/infrastructure-audit.constants.js";

const PG_FOREIGN_KEY_VIOLATION = "23503";

/** True when `error` is a Postgres foreign key violation surfaced by TypeORM. */
function isForeignKeyViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code ===
      PG_FOREIGN_KEY_VIOLATION
  );
}

@Injectable()
export class EstacionService {
  constructor(
    @InjectRepository(EstacionEntity)
    private readonly estacionRepository: Repository<EstacionEntity>,
    @InjectRepository(ParadaEntity)
    private readonly paradaRepository: Repository<ParadaEntity>,
    private readonly audit: InfrastructureAuditService
  ) {}

  async create(
    createEstacionDto: CreateEstacionDto,
    actorEmployeeId: string
  ): Promise<EstacionResponseDto> {
    // An estación is a 1:1 extension of a parada: the parada must exist and
    // must not already have an estación (tbl_estacion.id_parada is UNIQUE).
    await validateForeignKey(
      this.paradaRepository,
      createEstacionDto.idParada,
      "idParada",
      "Parada"
    );
    await this.ensureParadaWithoutEstacion(createEstacionDto.idParada);

    const saved = await this.estacionRepository.manager.transaction(
      async (manager) => {
        const repo = manager.getRepository(EstacionEntity);
        const estacion = repo.create(createEstacionDto);
        const persisted = await repo.save(estacion);
        await this.audit.record(manager, actorEmployeeId, {
          action: INFRASTRUCTURE_AUDIT_ACTIONS.CREATE,
          entityType: INFRASTRUCTURE_ENTITY_TYPES.ESTACION,
          entityId: String(persisted.idEstacion),
          detalle: {
            nombreEstacion: persisted.nombreEstacion,
            idParada: persisted.idParada,
          },
        });
        return persisted;
      }
    );
    return this.toResponseDto(saved);
  }

  async findAll(): Promise<EstacionResponseDto[]> {
    const estaciones = await this.estacionRepository.find();
    return estaciones.map((e) => this.toResponseDto(e));
  }

  async findOne(id: string): Promise<EstacionResponseDto> {
    const estacion = await this.estacionRepository.findOne({
      where: { idEstacion: Number(id) },
    });
    if (!estacion) {
      throw new NotFoundException(`Estación con ID ${id} no encontrada`);
    }
    return this.toResponseDto(estacion);
  }

  async update(
    id: string,
    updateEstacionDto: UpdateEstacionDto,
    actorEmployeeId: string
  ): Promise<EstacionResponseDto> {
    const estacion = await this.estacionRepository.findOne({
      where: { idEstacion: Number(id) },
    });
    if (!estacion) {
      throw new NotFoundException(`Estación con ID ${id} no encontrada`);
    }

    // idParada is NOT NULL: it can be changed but never cleared.
    if (updateEstacionDto.idParada === null) {
      throw new BadRequestException("idParada no puede ser nulo");
    }

    // Validate FK and the 1:1 uniqueness if the parada changes.
    if (
      updateEstacionDto.idParada !== undefined &&
      String(updateEstacionDto.idParada) !== String(estacion.idParada)
    ) {
      await validateForeignKey(
        this.paradaRepository,
        updateEstacionDto.idParada,
        "idParada",
        "Parada"
      );
      await this.ensureParadaWithoutEstacion(updateEstacionDto.idParada);
    }

    const changedFields = Object.keys(updateEstacionDto);
    const updated = await this.estacionRepository.manager.transaction(
      async (manager) => {
        const repo = manager.getRepository(EstacionEntity);
        Object.assign(estacion, updateEstacionDto);
        const persisted = await repo.save(estacion);
        await this.audit.record(manager, actorEmployeeId, {
          action: INFRASTRUCTURE_AUDIT_ACTIONS.UPDATE,
          entityType: INFRASTRUCTURE_ENTITY_TYPES.ESTACION,
          entityId: String(id),
          detalle: { changedFields },
        });
        return persisted;
      }
    );
    return this.toResponseDto(updated);
  }

  async remove(
    id: string,
    force: boolean,
    actorEmployeeId: string
  ): Promise<void> {
    const estacion = await this.estacionRepository.findOne({
      where: { idEstacion: Number(id) },
    });
    if (!estacion) {
      throw new NotFoundException(`Estación con ID ${id} no encontrada`);
    }

    if (!force) {
      // Soft delete: set status to CERRADA
      await this.estacionRepository.manager.transaction(async (manager) => {
        const repo = manager.getRepository(EstacionEntity);
        estacion.estadoEstacion = "CERRADA";
        await repo.save(estacion);
        await this.audit.record(manager, actorEmployeeId, {
          action: INFRASTRUCTURE_AUDIT_ACTIONS.REMOVE,
          entityType: INFRASTRUCTURE_ENTITY_TYPES.ESTACION,
          entityId: String(id),
          detalle: { nombreEstacion: estacion.nombreEstacion, force: false },
        });
      });
      return;
    }

    // Hard delete: the row disappears and its parada stops being an estación.
    // Rows that still reference it (tbl_estacion_linea, tbl_afectacion,
    // tbl_asignacion_estacion, tbl_alerta, ...) make Postgres reject the
    // delete; that is translated to a 409 instead of cascading.
    try {
      await this.estacionRepository.manager.transaction(async (manager) => {
        const repo = manager.getRepository(EstacionEntity);
        await repo.remove(estacion);
        await this.audit.record(manager, actorEmployeeId, {
          action: INFRASTRUCTURE_AUDIT_ACTIONS.REMOVE,
          entityType: INFRASTRUCTURE_ENTITY_TYPES.ESTACION,
          entityId: String(id),
          detalle: { nombreEstacion: estacion.nombreEstacion, force: true },
        });
      });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictException(
          `No se puede eliminar la estación ${id} porque tiene asignaciones o vínculos`,
          "ESTACION_IN_USE"
        );
      }
      throw error;
    }
  }

  private async ensureParadaWithoutEstacion(idParada: number): Promise<void> {
    const existing = await this.estacionRepository.findOne({
      where: { idParada },
    });
    if (existing) {
      throw new ConflictException(
        `La parada ${idParada} ya tiene una estación asociada`,
        "PARADA_ALREADY_HAS_ESTACION"
      );
    }
  }

  private toResponseDto(estacion: EstacionEntity): EstacionResponseDto {
    return {
      idEstacion: estacion.idEstacion,
      nombreEstacion: estacion.nombreEstacion,
      latitud: estacion.latitud,
      longitud: estacion.longitud,
      estadoEstacion: estacion.estadoEstacion as any,
      idParada: estacion.idParada,
    };
  }
}
