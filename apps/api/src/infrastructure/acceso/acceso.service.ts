import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { ParadaEntity } from "../parada/parada.entity.js";
import { validateForeignKey } from "../shared/validators.js";
import { AccesoEntity, EstadoAcceso } from "./acceso.entity.js";
import { AccesoResponseDto } from "./dto/acceso-response.dto.js";
import { CreateAccesoDto } from "./dto/create-acceso.dto.js";
import { UpdateAccesoDto } from "./dto/update-acceso.dto.js";
import { InfrastructureAuditService } from "../shared/infrastructure-audit.service.js";
import {
  INFRASTRUCTURE_AUDIT_ACTIONS,
  INFRASTRUCTURE_ENTITY_TYPES,
} from "../shared/infrastructure-audit.constants.js";

/**
 * Accesos are a sub-resource of a parada (/infrastructure/paradas/:id/accesos).
 * Every operation first checks that the parada exists (404) and then only
 * sees accesos owned by that parada, so an acceso of another parada is a 404.
 */
@Injectable()
export class AccesoService {
  constructor(
    @InjectRepository(AccesoEntity)
    private readonly accesoRepository: Repository<AccesoEntity>,
    @InjectRepository(ParadaEntity)
    private readonly paradaRepository: Repository<ParadaEntity>,
    private readonly audit: InfrastructureAuditService
  ) {}

  async list(paradaId: string): Promise<AccesoResponseDto[]> {
    await this.ensureParadaExists(paradaId);
    const accesos = await this.accesoRepository.find({
      where: { idParada: paradaId },
      order: { nombreAcceso: "ASC" },
    });
    return accesos.map((a) => this.toResponseDto(a));
  }

  async create(
    paradaId: string,
    dto: CreateAccesoDto,
    actorEmployeeId: string
  ): Promise<AccesoResponseDto> {
    await this.ensureParadaExists(paradaId);
    const saved = await this.accesoRepository.manager.transaction(
      async (manager) => {
        const repo = manager.getRepository(AccesoEntity);
        const acceso = repo.create({
          ...dto,
          idParada: paradaId,
          estadoAcceso: dto.estadoAcceso ?? EstadoAcceso.HABILITADO,
        });
        const persisted = await repo.save(acceso);
        await this.audit.record(manager, actorEmployeeId, {
          action: INFRASTRUCTURE_AUDIT_ACTIONS.CREATE,
          entityType: INFRASTRUCTURE_ENTITY_TYPES.ACCESO,
          entityId: String(persisted.idAcceso),
          detalle: {
            idParada: paradaId,
            nombreAcceso: persisted.nombreAcceso,
            tipoAcceso: persisted.tipoAcceso,
            estadoAcceso: persisted.estadoAcceso,
          },
        });
        return persisted;
      }
    );
    return this.toResponseDto(saved);
  }

  async findOne(paradaId: string, accesoId: string): Promise<AccesoResponseDto> {
    const acceso = await this.findOrFail(paradaId, accesoId);
    return this.toResponseDto(acceso);
  }

  async update(
    paradaId: string,
    accesoId: string,
    dto: UpdateAccesoDto,
    actorEmployeeId: string
  ): Promise<AccesoResponseDto> {
    const acceso = await this.findOrFail(paradaId, accesoId);
    const changedFields = Object.keys(dto);
    const updated = await this.accesoRepository.manager.transaction(
      async (manager) => {
        const repo = manager.getRepository(AccesoEntity);
        Object.assign(acceso, dto);
        // The owning parada is fixed by the route and never changes on update.
        acceso.idParada = paradaId;
        const persisted = await repo.save(acceso);
        await this.audit.record(manager, actorEmployeeId, {
          action: INFRASTRUCTURE_AUDIT_ACTIONS.UPDATE,
          entityType: INFRASTRUCTURE_ENTITY_TYPES.ACCESO,
          entityId: String(accesoId),
          detalle: { idParada: paradaId, changedFields },
        });
        return persisted;
      }
    );
    return this.toResponseDto(updated);
  }

  async remove(
    paradaId: string,
    accesoId: string,
    actorEmployeeId: string
  ): Promise<void> {
    const acceso = await this.findOrFail(paradaId, accesoId);

    // Soft delete like the sibling infrastructure modules: the row is kept and
    // only marked DESHABILITADO, which the DB CHECK allows.
    await this.accesoRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(AccesoEntity);
      acceso.estadoAcceso = EstadoAcceso.DESHABILITADO;
      await repo.save(acceso);
      await this.audit.record(manager, actorEmployeeId, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.REMOVE,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.ACCESO,
        entityId: String(accesoId),
        detalle: { idParada: paradaId, nombreAcceso: acceso.nombreAcceso },
      });
    });
  }

  private async findOrFail(
    paradaId: string,
    accesoId: string
  ): Promise<AccesoEntity> {
    await this.ensureParadaExists(paradaId);
    const acceso = await this.accesoRepository.findOne({
      where: { idAcceso: accesoId, idParada: paradaId },
    });
    if (!acceso) {
      throw new NotFoundException(
        `Acceso con ID ${accesoId} no encontrado en la parada ${paradaId}`
      );
    }
    return acceso;
  }

  private async ensureParadaExists(paradaId: string): Promise<void> {
    await validateForeignKey(
      this.paradaRepository,
      paradaId,
      "idParada",
      "Parada"
    );
  }

  private toResponseDto(acceso: AccesoEntity): AccesoResponseDto {
    return {
      idAcceso: acceso.idAcceso,
      idParada: acceso.idParada,
      nombreAcceso: acceso.nombreAcceso,
      latitud: acceso.latitud,
      longitud: acceso.longitud,
      tipoAcceso: acceso.tipoAcceso,
      estadoAcceso: acceso.estadoAcceso,
    };
  }
}
