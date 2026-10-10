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

const PG_UNIQUE_VIOLATION = "23505";

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
    private readonly municipalidadRepository: Repository<MunicipalidadEntity>
  ) {}

  async create(dto: CreateMunicipalidadDto): Promise<MunicipalidadResponseDto> {
    await this.ensureNombreAvailable(dto.nombreMunicipalidad);

    const municipalidad = this.municipalidadRepository.create({
      ...dto,
      estadoMunicipalidad: dto.estadoMunicipalidad ?? EstadoMunicipalidad.ACTIVA,
    });
    const saved = await this.saveOrConflict(municipalidad);
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
    dto: UpdateMunicipalidadDto
  ): Promise<MunicipalidadResponseDto> {
    const municipalidad = await this.findOrFail(id);

    if (
      dto.nombreMunicipalidad !== undefined &&
      dto.nombreMunicipalidad !== municipalidad.nombreMunicipalidad
    ) {
      await this.ensureNombreAvailable(dto.nombreMunicipalidad, id);
    }

    Object.assign(municipalidad, dto);
    const updated = await this.saveOrConflict(municipalidad);
    return this.toResponseDto(updated);
  }

  async remove(id: string): Promise<void> {
    const municipalidad = await this.findOrFail(id);

    // Soft delete like the sibling infrastructure modules: the row (and its
    // línea links) is kept and only marked INACTIVA, which the DB CHECK allows.
    municipalidad.estadoMunicipalidad = EstadoMunicipalidad.INACTIVA;
    await this.municipalidadRepository.save(municipalidad);
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
    municipalidad: MunicipalidadEntity
  ): Promise<MunicipalidadEntity> {
    try {
      return await this.municipalidadRepository.save(municipalidad);
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
