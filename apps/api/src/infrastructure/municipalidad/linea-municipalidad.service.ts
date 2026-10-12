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
import { validateForeignKey } from "../shared/validators.js";

@Injectable()
export class LineaMunicipalidadService {
  constructor(
    @InjectRepository(LineaMunicipalidadEntity)
    private readonly linkRepository: Repository<LineaMunicipalidadEntity>,
    @InjectRepository(LineaEntity)
    private readonly lineaRepository: Repository<LineaEntity>,
    @InjectRepository(MunicipalidadEntity)
    private readonly municipalidadRepository: Repository<MunicipalidadEntity>
  ) {}

  async list(lineaId: string): Promise<LineaMunicipalidadResponseDto[]> {
    await this.ensureLineaExists(lineaId);
    const links = await this.linkRepository.find({
      where: { idLinea: lineaId },
      relations: { municipalidad: true },
    });
    return links.map((l) => this.toResponseDto(l));
  }

  async add(
    lineaId: string,
    dto: CreateLineaMunicipalidadDto
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

    const record = this.linkRepository.create({
      idLinea: lineaId,
      idMunicipalidad: dto.idMunicipalidad,
    });
    try {
      const saved = await this.linkRepository.save(record);
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
  async remove(lineaId: string, municipalidadId: string): Promise<void> {
    const record = await this.linkRepository.findOne({
      where: { idLinea: lineaId, idMunicipalidad: municipalidadId },
    });
    if (!record) {
      throw new NotFoundException(
        `La municipalidad ${municipalidadId} no está vinculada a la línea ${lineaId}`
      );
    }
    await this.linkRepository.remove(record);
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
