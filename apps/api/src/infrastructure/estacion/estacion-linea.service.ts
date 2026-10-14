import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EstacionEntity } from "./estacion.entity.js";
import {
  EstacionLineaEntity,
  EstadoAsignacionLinea,
} from "./estacion-linea.entity.js";
import {
  CreateEstacionLineaDto,
  EstacionLineaAvailableDto,
  EstacionLineaResponseDto,
  UpdateEstacionLineaDto,
} from "./dto/estacion-linea.dto.js";
import { LineaEntity } from "../linea/linea.entity.js";
import { LineaParadaEntity } from "../linea/linea-parada.entity.js";
import { validateForeignKey } from "../shared/validators.js";
import { InfrastructureAuditService } from "../shared/infrastructure-audit.service.js";
import {
  INFRASTRUCTURE_AUDIT_ACTIONS,
  INFRASTRUCTURE_ENTITY_TYPES,
} from "../shared/infrastructure-audit.constants.js";

@Injectable()
export class EstacionLineaService {
  constructor(
    @InjectRepository(EstacionLineaEntity)
    private readonly estacionLineaRepository: Repository<EstacionLineaEntity>,
    @InjectRepository(EstacionEntity)
    private readonly estacionRepository: Repository<EstacionEntity>,
    @InjectRepository(LineaEntity)
    private readonly lineaRepository: Repository<LineaEntity>,
    private readonly audit: InfrastructureAuditService,
    @InjectRepository(LineaParadaEntity)
    private readonly lineaParadaRepository: Repository<LineaParadaEntity>
  ) {}

  async list(estacionId: string): Promise<EstacionLineaResponseDto[]> {
    await this.ensureEstacionExists(estacionId);
    const links = await this.estacionLineaRepository.find({
      where: { idEstacion: estacionId },
      relations: { linea: true },
    });
    return links.map((l) => this.toResponseDto(l));
  }

  /**
   * Lines that can still be linked: their route includes the station's
   * parada and they are not linked yet. Sorted by line number.
   */
  async available(estacionId: string): Promise<EstacionLineaAvailableDto[]> {
    await this.ensureEstacionExists(estacionId);
    const idParada = await this.findEstacionParada(estacionId);
    const [stops, links] = await Promise.all([
      this.lineaParadaRepository.find({
        where: { idParada },
        relations: { linea: true },
      }),
      this.estacionLineaRepository.find({ where: { idEstacion: estacionId } }),
    ]);
    const linked = new Set(links.map((l) => String(l.idLinea)));
    return stops
      .filter((stop) => stop.linea && !linked.has(String(stop.idLinea)))
      .map((stop) => ({
        idLinea: String(stop.linea!.idLinea),
        numeroLinea: stop.linea!.numeroLinea,
        nombreLinea: stop.linea!.nombreLinea,
      }))
      .sort((a, b) =>
        a.numeroLinea.localeCompare(b.numeroLinea, "es", { numeric: true })
      );
  }

  async add(
    estacionId: string,
    dto: CreateEstacionLineaDto,
    actorEmployeeId: string
  ): Promise<EstacionLineaResponseDto> {
    await this.ensureEstacionExists(estacionId);
    await validateForeignKey(
      this.lineaRepository,
      dto.idLinea,
      "idLinea",
      "Línea"
    );

    const existing = await this.estacionLineaRepository.findOne({
      where: { idEstacion: estacionId, idLinea: dto.idLinea },
    });
    if (existing) {
      throw new ConflictException(
        `La línea ${dto.idLinea} ya está vinculada a la estación ${estacionId}`,
        "ESTACION_LINEA_DUPLICATE"
      );
    }

    // Only a line that stops at the station can be linked to it; otherwise
    // its pilots would see a station their route never reaches.
    const idParada = await this.findEstacionParada(estacionId);
    const onRoute = await this.lineaParadaRepository.count({
      where: { idLinea: dto.idLinea, idParada },
    });
    if (onRoute === 0) {
      throw new BadRequestException(
        `La ruta de la línea ${dto.idLinea} no pasa por la parada de la estación ${estacionId}`,
        "ESTACION_LINEA_NOT_ON_ROUTE"
      );
    }

    const saved = await this.estacionLineaRepository.manager.transaction(
      async (manager) => {
        const repo = manager.getRepository(EstacionLineaEntity);
        const record = repo.create({
          idEstacion: estacionId,
          idLinea: dto.idLinea,
          tipoPunto: dto.tipoPunto,
          estadoAsignacion: dto.estadoAsignacion ?? EstadoAsignacionLinea.ACTIVA,
        });
        const persisted = await repo.save(record);
        await this.audit.record(manager, actorEmployeeId, {
          action: INFRASTRUCTURE_AUDIT_ACTIONS.LINK,
          entityType: INFRASTRUCTURE_ENTITY_TYPES.ESTACION_LINEA,
          entityId: String(estacionId),
          detalle: {
            idLinea: dto.idLinea,
            tipoPunto: persisted.tipoPunto,
            estadoAsignacion: persisted.estadoAsignacion,
          },
        });
        return persisted;
      }
    );
    return this.toResponseDto(saved);
  }

  async update(
    estacionId: string,
    lineaId: string,
    dto: UpdateEstacionLineaDto,
    actorEmployeeId: string
  ): Promise<EstacionLineaResponseDto> {
    const record = await this.findLinkOrFail(estacionId, lineaId);
    const changedFields = Object.keys(dto);
    const saved = await this.estacionLineaRepository.manager.transaction(
      async (manager) => {
        const repo = manager.getRepository(EstacionLineaEntity);
        if (dto.tipoPunto !== undefined) {
          record.tipoPunto = dto.tipoPunto;
        }
        if (dto.estadoAsignacion !== undefined) {
          record.estadoAsignacion = dto.estadoAsignacion;
        }
        const persisted = await repo.save(record);
        await this.audit.record(manager, actorEmployeeId, {
          action: INFRASTRUCTURE_AUDIT_ACTIONS.UPDATE,
          entityType: INFRASTRUCTURE_ENTITY_TYPES.ESTACION_LINEA,
          entityId: String(estacionId),
          detalle: { idLinea: lineaId, changedFields },
        });
        return persisted;
      }
    );
    return this.toResponseDto(saved);
  }

  /** Hard-deletes the link row; neither the station nor the line is touched. */
  async remove(
    estacionId: string,
    lineaId: string,
    actorEmployeeId: string
  ): Promise<void> {
    const record = await this.findLinkOrFail(estacionId, lineaId);
    await this.estacionLineaRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(EstacionLineaEntity);
      await repo.remove(record);
      await this.audit.record(manager, actorEmployeeId, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.UNLINK,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.ESTACION_LINEA,
        entityId: String(estacionId),
        detalle: { idLinea: lineaId },
      });
    });
  }

  private async ensureEstacionExists(estacionId: string): Promise<void> {
    await validateForeignKey(
      this.estacionRepository,
      estacionId,
      "idEstacion",
      "Estación"
    );
  }

  private async findEstacionParada(estacionId: string): Promise<string> {
    const estacion = await this.estacionRepository.findOne({
      where: { idEstacion: estacionId as unknown as number },
    });
    if (!estacion) {
      throw new NotFoundException(`Estación ${estacionId} no encontrada`);
    }
    return String(estacion.idParada);
  }

  private async findLinkOrFail(
    estacionId: string,
    lineaId: string
  ): Promise<EstacionLineaEntity> {
    const record = await this.estacionLineaRepository.findOne({
      where: { idEstacion: estacionId, idLinea: lineaId },
      relations: { linea: true },
    });
    if (!record) {
      throw new NotFoundException(
        `La línea ${lineaId} no está vinculada a la estación ${estacionId}`
      );
    }
    return record;
  }

  private toResponseDto(link: EstacionLineaEntity): EstacionLineaResponseDto {
    return {
      idEstacion: link.idEstacion,
      idLinea: link.idLinea,
      nombreLinea: link.linea?.nombreLinea,
      tipoPunto: link.tipoPunto,
      estadoAsignacion: link.estadoAsignacion,
    };
  }
}
