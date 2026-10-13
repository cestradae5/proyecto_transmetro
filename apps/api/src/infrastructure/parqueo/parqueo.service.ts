import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ParqueoEntity } from "./parqueo.entity.js";
import { CreateParqueoDto } from "./dto/create-parqueo.dto.js";
import { UpdateParqueoDto } from "./dto/update-parqueo.dto.js";
import { ParqueoResponseDto } from "./dto/parqueo-response.dto.js";
import { InfrastructureAuditService } from "../shared/infrastructure-audit.service.js";
import {
  INFRASTRUCTURE_AUDIT_ACTIONS,
  INFRASTRUCTURE_ENTITY_TYPES,
} from "../shared/infrastructure-audit.constants.js";

// A parqueo is a standalone resource: it has no FK to estación. Líneas point
// to their parqueo through tbl_linea.id_parqueo (nullable).
@Injectable()
export class ParqueoService {
  constructor(
    @InjectRepository(ParqueoEntity)
    private readonly parqueoRepository: Repository<ParqueoEntity>,
    private readonly audit: InfrastructureAuditService
  ) {}

  async create(
    createParqueoDto: CreateParqueoDto,
    actorEmployeeId: string
  ): Promise<ParqueoResponseDto> {
    const saved = await this.parqueoRepository.manager.transaction(
      async (manager) => {
        const repo = manager.getRepository(ParqueoEntity);
        const parqueo = repo.create(createParqueoDto);
        const persisted = await repo.save(parqueo);
        await this.audit.record(manager, actorEmployeeId, {
          action: INFRASTRUCTURE_AUDIT_ACTIONS.CREATE,
          entityType: INFRASTRUCTURE_ENTITY_TYPES.PARQUEO,
          entityId: String(persisted.idParqueo),
          detalle: {
            nombreParqueo: persisted.nombreParqueo,
            tipoParqueo: persisted.tipoParqueo,
            estadoParqueo: persisted.estadoParqueo,
          },
        });
        return persisted;
      }
    );
    return this.toResponseDto(saved);
  }

  async findAll(): Promise<ParqueoResponseDto[]> {
    const parqueos = await this.parqueoRepository.find();
    return parqueos.map((p) => this.toResponseDto(p));
  }

  async findOne(id: string): Promise<ParqueoResponseDto> {
    const parqueo = await this.parqueoRepository.findOne({
      where: { idParqueo: id },
    });
    if (!parqueo) {
      throw new NotFoundException(`Parqueo con ID ${id} no encontrado`);
    }
    return this.toResponseDto(parqueo);
  }

  async update(
    id: string,
    updateParqueoDto: UpdateParqueoDto,
    actorEmployeeId: string
  ): Promise<ParqueoResponseDto> {
    const parqueo = await this.parqueoRepository.findOne({
      where: { idParqueo: id },
    });
    if (!parqueo) {
      throw new NotFoundException(`Parqueo con ID ${id} no encontrado`);
    }

    const changedFields = Object.keys(updateParqueoDto);
    const updated = await this.parqueoRepository.manager.transaction(
      async (manager) => {
        const repo = manager.getRepository(ParqueoEntity);
        Object.assign(parqueo, updateParqueoDto);
        const persisted = await repo.save(parqueo);
        await this.audit.record(manager, actorEmployeeId, {
          action: INFRASTRUCTURE_AUDIT_ACTIONS.UPDATE,
          entityType: INFRASTRUCTURE_ENTITY_TYPES.PARQUEO,
          entityId: String(id),
          detalle: { changedFields },
        });
        return persisted;
      }
    );
    return this.toResponseDto(updated);
  }

  async remove(id: string, actorEmployeeId: string): Promise<void> {
    const parqueo = await this.parqueoRepository.findOne({
      where: { idParqueo: id },
    });
    if (!parqueo) {
      throw new NotFoundException(`Parqueo con ID ${id} no encontrado`);
    }

    // Soft delete: set status to CERRADO
    await this.parqueoRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(ParqueoEntity);
      parqueo.estadoParqueo = "CERRADO" as any;
      await repo.save(parqueo);
      await this.audit.record(manager, actorEmployeeId, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.REMOVE,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.PARQUEO,
        entityId: String(id),
        detalle: { nombreParqueo: parqueo.nombreParqueo },
      });
    });
  }

  private toResponseDto(parqueo: ParqueoEntity): ParqueoResponseDto {
    return {
      idParqueo: parqueo.idParqueo,
      nombreParqueo: parqueo.nombreParqueo,
      tipoParqueo: parqueo.tipoParqueo,
      direccion: parqueo.direccion,
      latitud: parqueo.latitud,
      longitud: parqueo.longitud,
      capacidadUnidades: parqueo.capacidadUnidades,
      estadoParqueo: parqueo.estadoParqueo,
    };
  }
}
