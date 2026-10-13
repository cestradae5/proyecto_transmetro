import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AfectacionEntity, EstadoAfectacion } from "./afectacion.entity.js";
import { CreateAfectacionDto } from "./dto/create-afectacion.dto.js";
import { UpdateAfectacionDto } from "./dto/update-afectacion.dto.js";
import { AfectacionResponseDto } from "./dto/afectacion-response.dto.js";
import { validateForeignKey } from "../shared/validators.js";
import { ParadaEntity } from "../parada/parada.entity.js";
import { EstacionEntity } from "../estacion/estacion.entity.js";
import { InfrastructureAuditService } from "../shared/infrastructure-audit.service.js";
import {
  INFRASTRUCTURE_AUDIT_ACTIONS,
  INFRASTRUCTURE_ENTITY_TYPES,
} from "../shared/infrastructure-audit.constants.js";

@Injectable()
export class AfectacionService {
  constructor(
    @InjectRepository(AfectacionEntity)
    private readonly afectacionRepository: Repository<AfectacionEntity>,
    @InjectRepository(ParadaEntity)
    private readonly paradaRepository: Repository<ParadaEntity>,
    @InjectRepository(EstacionEntity)
    private readonly estacionRepository: Repository<EstacionEntity>,
    private readonly audit: InfrastructureAuditService
  ) {}

  async create(
    createAfectacionDto: CreateAfectacionDto,
    actorEmployeeId: string
  ): Promise<AfectacionResponseDto> {
    // XOR validation: exactly one must be provided
    const hasParada = !!createAfectacionDto.idParada;
    const hasEstacion = !!createAfectacionDto.idEstacion;

    if (hasParada === hasEstacion) {
      throw new BadRequestException(
        "Debe proporcionar exactamente uno: idParada o idEstacion"
      );
    }

    // Validate FK
    if (hasParada) {
      await validateForeignKey(
        this.paradaRepository,
        createAfectacionDto.idParada!,
        "idParada",
        "Parada"
      );
    } else {
      await validateForeignKey(
        this.estacionRepository,
        createAfectacionDto.idEstacion!,
        "idEstacion",
        "Estación"
      );
    }

    const saved = await this.afectacionRepository.manager.transaction(
      async (manager) => {
        const repo = manager.getRepository(AfectacionEntity);
        const afectacion = repo.create(createAfectacionDto);
        const persisted = await repo.save(afectacion);
        await this.audit.record(manager, actorEmployeeId, {
          action: INFRASTRUCTURE_AUDIT_ACTIONS.CREATE,
          entityType: INFRASTRUCTURE_ENTITY_TYPES.AFECTACION,
          entityId: String(persisted.idAfectacion),
          detalle: {
            tipoAfectacion: persisted.tipoAfectacion,
            idParada: persisted.idParada ?? null,
            idEstacion: persisted.idEstacion ?? null,
          },
        });
        return persisted;
      }
    );
    return this.toResponseDto(saved);
  }

  async findAll(): Promise<AfectacionResponseDto[]> {
    const afectaciones = await this.afectacionRepository.find();
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

  async update(
    id: string,
    updateAfectacionDto: UpdateAfectacionDto,
    actorEmployeeId: string
  ): Promise<AfectacionResponseDto> {
    const afectacion = await this.afectacionRepository.findOne({
      where: { idAfectacion: id },
    });
    if (!afectacion) {
      throw new NotFoundException(`Afectación con ID ${id} no encontrada`);
    }

    // XOR validation if both are provided in update
    if (updateAfectacionDto.idParada && updateAfectacionDto.idEstacion) {
      throw new BadRequestException(
        "No puede proporcionar idParada e idEstacion simultáneamente"
      );
    }

    // Validate FK if provided
    if (updateAfectacionDto.idParada) {
      await validateForeignKey(
        this.paradaRepository,
        updateAfectacionDto.idParada,
        "idParada",
        "Parada"
      );
      // Clear the other FK
      afectacion.idEstacion = undefined;
    }

    if (updateAfectacionDto.idEstacion) {
      await validateForeignKey(
        this.estacionRepository,
        updateAfectacionDto.idEstacion,
        "idEstacion",
        "Estación"
      );
      // Clear the other FK
      afectacion.idParada = undefined;
    }

    const changedFields = Object.keys(updateAfectacionDto);
    const updated = await this.afectacionRepository.manager.transaction(
      async (manager) => {
        const repo = manager.getRepository(AfectacionEntity);
        Object.assign(afectacion, updateAfectacionDto);
        const persisted = await repo.save(afectacion);
        await this.audit.record(manager, actorEmployeeId, {
          action: INFRASTRUCTURE_AUDIT_ACTIONS.UPDATE,
          entityType: INFRASTRUCTURE_ENTITY_TYPES.AFECTACION,
          entityId: String(id),
          detalle: { changedFields },
        });
        return persisted;
      }
    );
    return this.toResponseDto(updated);
  }

  async close(id: string, actorEmployeeId: string): Promise<AfectacionResponseDto> {
    const afectacion = await this.afectacionRepository.findOne({
      where: { idAfectacion: id },
    });
    if (!afectacion) {
      throw new NotFoundException(`Afectación con ID ${id} no encontrada`);
    }
    if (afectacion.estadoAfectacion === EstadoAfectacion.CERRADA) {
      throw new ConflictException(
        `La afectación ${id} ya está cerrada`,
        "AFECTACION_ALREADY_CLOSED"
      );
    }

    const closed = await this.afectacionRepository.manager.transaction(
      async (manager) => {
        const repo = manager.getRepository(AfectacionEntity);
        afectacion.estadoAfectacion = EstadoAfectacion.CERRADA;
        afectacion.fechaFin = new Date();
        const persisted = await repo.save(afectacion);
        await this.audit.record(manager, actorEmployeeId, {
          action: INFRASTRUCTURE_AUDIT_ACTIONS.UPDATE,
          entityType: INFRASTRUCTURE_ENTITY_TYPES.AFECTACION,
          entityId: String(id),
          detalle: { estadoAfectacion: EstadoAfectacion.CERRADA, closed: true },
        });
        return persisted;
      }
    );
    return this.toResponseDto(closed);
  }

  async remove(id: string, actorEmployeeId: string): Promise<void> {
    const afectacion = await this.afectacionRepository.findOne({
      where: { idAfectacion: id },
    });
    if (!afectacion) {
      throw new NotFoundException(`Afectación con ID ${id} no encontrada`);
    }

    // Soft delete: set status to CERRADA
    await this.afectacionRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(AfectacionEntity);
      afectacion.estadoAfectacion = "CERRADA" as any;
      await repo.save(afectacion);
      await this.audit.record(manager, actorEmployeeId, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.REMOVE,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.AFECTACION,
        entityId: String(id),
        detalle: { tipoAfectacion: afectacion.tipoAfectacion },
      });
    });
  }

  private toResponseDto(afectacion: AfectacionEntity): AfectacionResponseDto {
    return {
      idAfectacion: afectacion.idAfectacion,
      tipoAfectacion: afectacion.tipoAfectacion,
      motivo: afectacion.motivo,
      fechaInicio: afectacion.fechaInicio,
      fechaFin: afectacion.fechaFin,
      estadoAfectacion: afectacion.estadoAfectacion,
      idParada: afectacion.idParada,
      idEstacion: afectacion.idEstacion,
    };
  }
}
