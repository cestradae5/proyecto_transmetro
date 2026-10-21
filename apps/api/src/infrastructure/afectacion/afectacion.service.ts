import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { EntityManager, Repository } from "typeorm";
import {
  AccionAfectacion,
  AfectacionEntity,
  ESTADO_AFECTACION_APLICADA,
} from "./afectacion.entity.js";
import { CreateAfectacionDto } from "./dto/create-afectacion.dto.js";
import { AfectacionResponseDto } from "./dto/afectacion-response.dto.js";
import { LineaEntity, EstadoLinea } from "../linea/linea.entity.js";
import { ParadaEntity, EstadoParada } from "../parada/parada.entity.js";
import { EstacionEntity } from "../estacion/estacion.entity.js";
import { InfrastructureAuditService } from "../shared/infrastructure-audit.service.js";
import {
  INFRASTRUCTURE_AUDIT_ACTIONS,
  INFRASTRUCTURE_ENTITY_TYPES,
  type InfrastructureEntityType,
} from "../shared/infrastructure-audit.constants.js";

/**
 * Loads, reads and writes the state of one kind of afectación target. Ids are
 * bigint columns, so they travel as numeric strings (validated by the DTO)
 * even where an entity types its key as number.
 */
interface TargetKind {
  entityType: InfrastructureEntityType;
  /** "Línea con ID 9 no encontrada" */
  label: string;
  /** "La línea ya está activa" */
  article: string;
  load(manager: EntityManager, id: string): Promise<{ row: object; estado: string } | null>;
  save(manager: EntityManager, row: object, estado: string): Promise<void>;
  activeState: string;
  inactiveState: string;
}

const LINEA: TargetKind = {
  entityType: INFRASTRUCTURE_ENTITY_TYPES.LINEA,
  label: "Línea",
  article: "La línea",
  activeState: EstadoLinea.ACTIVA,
  inactiveState: EstadoLinea.INACTIVA,
  async load(manager, id) {
    const row = await manager.getRepository(LineaEntity).findOne({
      where: { idLinea: id },
      lock: { mode: "pessimistic_write" },
    });
    return row ? { row, estado: row.estadoLinea } : null;
  },
  async save(manager, row, estado) {
    await manager
      .getRepository(LineaEntity)
      .save({ ...(row as LineaEntity), estadoLinea: estado as EstadoLinea });
  },
};

const PARADA: TargetKind = {
  entityType: INFRASTRUCTURE_ENTITY_TYPES.PARADA,
  label: "Parada",
  article: "La parada",
  activeState: EstadoParada.ACTIVA,
  inactiveState: EstadoParada.CERRADA,
  async load(manager, id) {
    const row = await manager.getRepository(ParadaEntity).findOne({
      where: { idParada: id as unknown as number },
      lock: { mode: "pessimistic_write" },
    });
    return row ? { row, estado: row.estadoParada } : null;
  },
  async save(manager, row, estado) {
    await manager
      .getRepository(ParadaEntity)
      .save({ ...(row as ParadaEntity), estadoParada: estado as EstadoParada });
  },
};

const ESTACION: TargetKind = {
  entityType: INFRASTRUCTURE_ENTITY_TYPES.ESTACION,
  label: "Estación",
  article: "La estación",
  activeState: "ACTIVA",
  inactiveState: "CERRADA",
  async load(manager, id) {
    const row = await manager.getRepository(EstacionEntity).findOne({
      where: { idEstacion: id as unknown as number },
      lock: { mode: "pessimistic_write" },
    });
    return row ? { row, estado: row.estadoEstacion } : null;
  },
  async save(manager, row, estado) {
    await manager
      .getRepository(EstacionEntity)
      .save({ ...(row as EstacionEntity), estadoEstacion: estado });
  },
};

@Injectable()
export class AfectacionService {
  constructor(
    @InjectRepository(AfectacionEntity)
    private readonly afectacionRepository: Repository<AfectacionEntity>,
    private readonly audit: InfrastructureAuditService
  ) {}

  /**
   * Applies the afectación: sets the target's state, stores the afectación and
   * writes its bitácora row, all in one transaction. The target row is locked
   * so two concurrent afectaciones on it cannot both pass the "already in that
   * state" check. Dates are informative: nothing reverts automatically.
   */
  async create(dto: CreateAfectacionDto, actorEmployeeId: string): Promise<AfectacionResponseDto> {
    const targets = [
      dto.idLinea ? ([LINEA, dto.idLinea] as const) : null,
      dto.idParada ? ([PARADA, dto.idParada] as const) : null,
      dto.idEstacion ? ([ESTACION, dto.idEstacion] as const) : null,
    ].filter((target) => target !== null);
    if (targets.length !== 1) {
      throw new BadRequestException(
        "Debe proporcionar exactamente uno: idLinea, idParada o idEstacion"
      );
    }
    if (dto.fechaFin && new Date(dto.fechaFin) < new Date(dto.fechaInicio)) {
      throw new BadRequestException(
        "La fecha de fin no puede ser anterior a la fecha de inicio"
      );
    }
    const [kind, targetId] = targets[0]!;
    const activar = dto.accion === AccionAfectacion.ACTIVAR;
    const estadoNuevo = activar ? kind.activeState : kind.inactiveState;

    const saved = await this.afectacionRepository.manager.transaction(async (manager) => {
      const target = await kind.load(manager, targetId);
      if (!target) {
        throw new NotFoundException(`${kind.label} con ID ${targetId} no encontrada`);
      }
      if (target.estado === estadoNuevo) {
        throw new ConflictException(
          `${kind.article} ya está ${activar ? "activa" : "inactiva"}`,
          "AFECTACION_SIN_CAMBIO"
        );
      }
      await kind.save(manager, target.row, estadoNuevo);

      const repo = manager.getRepository(AfectacionEntity);
      const persisted = await repo.save(
        repo.create({
          tipoAfectacion: dto.accion,
          motivo: dto.motivo,
          fechaInicio: dto.fechaInicio,
          fechaFin: dto.fechaFin ?? null,
          estadoAfectacion: ESTADO_AFECTACION_APLICADA,
          idLinea: dto.idLinea ?? null,
          idParada: dto.idParada ?? null,
          idEstacion: dto.idEstacion ?? null,
        })
      );
      await this.audit.record(manager, actorEmployeeId, {
        action: activar
          ? INFRASTRUCTURE_AUDIT_ACTIONS.ACTIVATE
          : INFRASTRUCTURE_AUDIT_ACTIONS.DEACTIVATE,
        entityType: kind.entityType,
        entityId: String(targetId),
        detalle: {
          idAfectacion: String(persisted.idAfectacion),
          motivo: dto.motivo,
          fechaInicio: dto.fechaInicio,
          fechaFin: dto.fechaFin ?? null,
          estadoAnterior: target.estado,
          estadoNuevo,
        },
      });
      return persisted;
    });
    return this.toResponseDto(saved);
  }

  async findAll(): Promise<AfectacionResponseDto[]> {
    const afectaciones = await this.afectacionRepository.find({
      order: { fechaInicio: "DESC", idAfectacion: "DESC" },
    });
    return afectaciones.map((a) => this.toResponseDto(a));
  }

  async findOne(id: string): Promise<AfectacionResponseDto> {
    const afectacion = await this.afectacionRepository.findOne({
      where: { idAfectacion: id },
    });
    if (!afectacion) {
      throw new NotFoundException(`Afectación con ID ${id} no encontrada`);
    }
    return this.toResponseDto(afectacion);
  }

  private toResponseDto(afectacion: AfectacionEntity): AfectacionResponseDto {
    return {
      idAfectacion: afectacion.idAfectacion,
      accion: afectacion.tipoAfectacion,
      motivo: afectacion.motivo,
      fechaInicio: afectacion.fechaInicio,
      fechaFin: afectacion.fechaFin ?? null,
      idLinea: afectacion.idLinea ?? null,
      idParada: afectacion.idParada ?? null,
      idEstacion: afectacion.idEstacion ?? null,
    };
  }
}
