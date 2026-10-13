import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { LineaMunicipalidadEntity } from "./linea-municipalidad.entity.js";
import { MunicipalidadEntity } from "./municipalidad.entity.js";
import {
  CreateLineaMunicipalidadDto,
  LineaMunicipalidadResponseDto,
} from "./dto/linea-municipalidad.dto.js";
import { isUniqueViolation } from "./municipalidad.service.js";
import { LineaEntity } from "../linea/linea.entity.js";
import {
  LineaResponseDto,
  toLineaResponseDto,
} from "../linea/dto/linea-response.dto.js";
import { validateForeignKey } from "../shared/validators.js";
import { InfrastructureAuditService } from "../shared/infrastructure-audit.service.js";
import {
  INFRASTRUCTURE_AUDIT_ACTIONS,
  INFRASTRUCTURE_ENTITY_TYPES,
} from "../shared/infrastructure-audit.constants.js";

@Injectable()
export class LineaMunicipalidadService {
  constructor(
    @InjectRepository(LineaMunicipalidadEntity)
    private readonly linkRepository: Repository<LineaMunicipalidadEntity>,
    @InjectRepository(LineaEntity)
    private readonly lineaRepository: Repository<LineaEntity>,
    @InjectRepository(MunicipalidadEntity)
    private readonly municipalidadRepository: Repository<MunicipalidadEntity>,
    private readonly audit: InfrastructureAuditService
  ) {}

  async list(lineaId: string): Promise<LineaMunicipalidadResponseDto[]> {
    await this.ensureLineaExists(lineaId);
    const links = await this.linkRepository.find({
      where: { idLinea: lineaId },
      relations: { municipalidad: true },
    });
    return links.map((l) => this.toResponseDto(l));
  }

  /**
   * Líneas linked to a municipalidad, resolved with a single join through
   * tbl_linea_municipalidad (no per-línea lookups).
   */
  async listLineas(municipalidadId: string): Promise<LineaResponseDto[]> {
    await validateForeignKey(
      this.municipalidadRepository,
      municipalidadId,
      "idMunicipalidad",
      "Municipalidad"
    );
    const links = await this.linkRepository.find({
      where: { idMunicipalidad: municipalidadId },
      relations: { linea: true },
      order: { linea: { numeroLinea: "ASC" } },
    });
    return links
      .filter((l): l is LineaMunicipalidadEntity & { linea: LineaEntity } =>
        Boolean(l.linea)
      )
      .map((l) => toLineaResponseDto(l.linea));
  }

  async add(
    lineaId: string,
    dto: CreateLineaMunicipalidadDto,
    actorEmployeeId: string
  ): Promise<LineaMunicipalidadResponseDto> {
    await this.ensureLineaExists(lineaId);
    const municipalidad = await this.municipalidadRepository.findOne({
      where: { idMunicipalidad: dto.idMunicipalidad },
    });
    if (!municipalidad) {
      throw new NotFoundException(
        `Municipalidad con ID ${dto.idMunicipalidad} no encontrada`
      );
    }

    const existing = await this.linkRepository.findOne({
      where: { idLinea: lineaId, idMunicipalidad: dto.idMunicipalidad },
    });
    if (existing) {
      throw this.duplicateLink(lineaId, dto.idMunicipalidad);
    }

    try {
      // The link and its audit row commit or roll back together.
      const saved = await this.linkRepository.manager.transaction(
        async (manager) => {
          const repo = manager.getRepository(LineaMunicipalidadEntity);
          const record = repo.create({
            idLinea: lineaId,
            idMunicipalidad: dto.idMunicipalidad,
          });
          const persisted = await repo.save(record);
          await this.audit.record(manager, actorEmployeeId, {
            action: INFRASTRUCTURE_AUDIT_ACTIONS.LINK,
            entityType: INFRASTRUCTURE_ENTITY_TYPES.LINEA_MUNICIPALIDAD,
            entityId: lineaId,
            detalle: { idMunicipalidad: dto.idMunicipalidad },
          });
          return persisted;
        }
      );
      return this.toResponseDto({ ...saved, municipalidad });
    } catch (error) {
      // Composite PK still guards concurrent duplicate links.
      if (isUniqueViolation(error)) {
        throw this.duplicateLink(lineaId, dto.idMunicipalidad);
      }
      throw error;
    }
  }

  /** Hard-deletes the link row; neither the línea nor the municipalidad is touched. */
  async remove(
    lineaId: string,
    municipalidadId: string,
    actorEmployeeId: string
  ): Promise<void> {
    const record = await this.linkRepository.findOne({
      where: { idLinea: lineaId, idMunicipalidad: municipalidadId },
    });
    if (!record) {
      throw new NotFoundException(
        `La municipalidad ${municipalidadId} no está vinculada a la línea ${lineaId}`
      );
    }
    await this.linkRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(LineaMunicipalidadEntity);
      await repo.remove(record);
      await this.audit.record(manager, actorEmployeeId, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.UNLINK,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.LINEA_MUNICIPALIDAD,
        entityId: lineaId,
        detalle: { idMunicipalidad: municipalidadId },
      });
    });
  }

  private async ensureLineaExists(lineaId: string): Promise<void> {
    await validateForeignKey(this.lineaRepository, lineaId, "idLinea", "Línea");
  }

  private duplicateLink(
    lineaId: string,
    municipalidadId: string
  ): ConflictException {
    return new ConflictException(
      `La municipalidad ${municipalidadId} ya está vinculada a la línea ${lineaId}`,
      "LINEA_MUNICIPALIDAD_DUPLICATE"
    );
  }

  private toResponseDto(
    link: LineaMunicipalidadEntity
  ): LineaMunicipalidadResponseDto {
    return {
      idLinea: link.idLinea,
      idMunicipalidad: link.idMunicipalidad,
      nombreMunicipalidad: link.municipalidad?.nombreMunicipalidad,
    };
  }
}
