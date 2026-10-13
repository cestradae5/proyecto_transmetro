import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { EstacionEntity } from "../estacion/estacion.entity.js";
import { CreateParadaDto } from "./dto/create-parada.dto.js";
import { ParadaResponseDto } from "./dto/parada-response.dto.js";
import { UpdateParadaDto } from "./dto/update-parada.dto.js";
import { EstadoParada, ParadaEntity } from "./parada.entity.js";
import { InfrastructureAuditService } from "../shared/infrastructure-audit.service.js";
import {
  INFRASTRUCTURE_AUDIT_ACTIONS,
  INFRASTRUCTURE_ENTITY_TYPES,
} from "../shared/infrastructure-audit.constants.js";

@Injectable()
export class ParadaService {
  constructor(
    @InjectRepository(ParadaEntity)
    private readonly paradaRepository: Repository<ParadaEntity>,
    @InjectRepository(EstacionEntity)
    private readonly estacionRepository: Repository<EstacionEntity>,
    private readonly audit: InfrastructureAuditService,
  ) {}

  async create(
    dto: CreateParadaDto,
    actorEmployeeId: string,
  ): Promise<ParadaResponseDto> {
    const saved = await this.paradaRepository.manager.transaction(
      async (manager) => {
        const repo = manager.getRepository(ParadaEntity);
        const parada = repo.create(dto);
        const persisted = await repo.save(parada);
        await this.audit.record(manager, actorEmployeeId, {
          action: INFRASTRUCTURE_AUDIT_ACTIONS.CREATE,
          entityType: INFRASTRUCTURE_ENTITY_TYPES.PARADA,
          entityId: String(persisted.idParada),
          detalle: {
            nombreParada: persisted.nombreParada,
            estadoParada: persisted.estadoParada,
          },
        });
        return persisted;
      },
    );
    // A new parada never has an estación yet: those are created afterwards
    // through /infrastructure/estaciones.
    return this.toResponseDto(saved, null);
  }

  async findAll(): Promise<ParadaResponseDto[]> {
    const paradas = await this.paradaRepository.find();
    const estacionByParada = await this.findEstacionIds(
      paradas.map((p) => p.idParada),
    );
    return paradas.map((p) =>
      this.toResponseDto(p, estacionByParada.get(String(p.idParada)) ?? null),
    );
  }

  async findOne(id: string): Promise<ParadaResponseDto> {
    const parada = await this.findOrFail(id);
    const estacionByParada = await this.findEstacionIds([parada.idParada]);
    return this.toResponseDto(
      parada,
      estacionByParada.get(String(parada.idParada)) ?? null,
    );
  }

  async update(
    id: string,
    dto: UpdateParadaDto,
    actorEmployeeId: string,
  ): Promise<ParadaResponseDto> {
    await this.findOrFail(id);
    const changedFields = Object.keys(dto);
    await this.paradaRepository.manager.transaction(async (manager) => {
      await manager.getRepository(ParadaEntity).update({ idParada: Number(id) }, dto);
      await this.audit.record(manager, actorEmployeeId, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.UPDATE,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.PARADA,
        entityId: String(id),
        detalle: { changedFields },
      });
    });
    return this.findOne(id);
  }

  async remove(
    id: string,
    force: boolean,
    actorEmployeeId: string,
  ): Promise<void> {
    const parada = await this.findOrFail(id);

    await this.paradaRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(ParadaEntity);
      if (force) {
        await repo.remove(parada);
      } else {
        parada.estadoParada = EstadoParada.CERRADA;
        await repo.save(parada);
      }
      await this.audit.record(manager, actorEmployeeId, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.REMOVE,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.PARADA,
        entityId: String(id),
        detalle: { nombreParada: parada.nombreParada, force },
      });
    });
  }

  private async findOrFail(id: string): Promise<ParadaEntity> {
    const parada = await this.paradaRepository.findOne({
      where: { idParada: Number(id) },
    });

    if (!parada) {
      throw new NotFoundException(`Parada con ID ${id} no encontrada`);
    }

    return parada;
  }

  /**
   * One IN query (no N+1) mapping each parada id to its estación id. Keys are
   * stringified because Postgres returns bigint columns as strings.
   */
  private async findEstacionIds(
    paradaIds: number[],
  ): Promise<Map<string, number>> {
    const estacionByParada = new Map<string, number>();
    if (paradaIds.length === 0) {
      return estacionByParada;
    }

    const estaciones = await this.estacionRepository.find({
      select: { idEstacion: true, idParada: true },
      where: { idParada: In(paradaIds) },
    });
    for (const estacion of estaciones) {
      estacionByParada.set(String(estacion.idParada), estacion.idEstacion);
    }
    return estacionByParada;
  }

  private toResponseDto(
    parada: ParadaEntity,
    idEstacion: number | null,
  ): ParadaResponseDto {
    return {
      idParada: parada.idParada,
      nombreParada: parada.nombreParada,
      latitud: parada.latitud,
      longitud: parada.longitud,
      estadoParada: parada.estadoParada,
      esEstacion: idEstacion !== null,
      idEstacion,
    };
  }
}
