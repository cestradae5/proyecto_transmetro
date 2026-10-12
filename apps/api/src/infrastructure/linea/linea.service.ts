import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EstadoLinea, LineaEntity } from "./linea.entity.js";
import { LineaParadaEntity } from "./linea-parada.entity.js";
import { CreateLineaDto } from "./dto/create-linea.dto.js";
import { UpdateLineaDto } from "./dto/update-linea.dto.js";
import {
  LineaResponseDto,
  toLineaResponseDto,
} from "./dto/linea-response.dto.js";
import { AddLineaParadaDto } from "./dto/add-linea-parada.dto.js";
import { UpdateLineaParadaDto } from "./dto/update-linea-parada.dto.js";
import { ReorderLineaParadasDto } from "./dto/reorder-linea-paradas.dto.js";
import { validateForeignKey } from "../shared/validators.js";
import { ParqueoEntity } from "../parqueo/parqueo.entity.js";
import { ParadaEntity } from "../parada/parada.entity.js";

/** Minimum number of paradas a línea must keep once its sequence is built. */
export const LINEA_MIN_PARADAS = 2;

@Injectable()
export class LineaService {
  constructor(
    @InjectRepository(LineaEntity)
    private readonly lineaRepository: Repository<LineaEntity>,
    @InjectRepository(ParqueoEntity)
    private readonly parqueoRepository: Repository<ParqueoEntity>,
    @InjectRepository(LineaParadaEntity)
    private readonly lineaParadaRepository: Repository<LineaParadaEntity>,
    @InjectRepository(ParadaEntity)
    private readonly paradaRepository: Repository<ParadaEntity>
  ) {}

  async create(createLineaDto: CreateLineaDto): Promise<LineaResponseDto> {
    // The parqueo is optional: a línea is created first and the parqueo is
    // assigned later. Validate the FK only when one is provided.
    if (createLineaDto.idParqueo) {
      await validateForeignKey(
        this.parqueoRepository,
        createLineaDto.idParqueo,
        "idParqueo",
        "Parqueo"
      );
    }

    const linea = this.lineaRepository.create({
      ...createLineaDto,
      idParqueo: createLineaDto.idParqueo ?? null,
    });
    const saved = await this.lineaRepository.save(linea);
    return this.toResponseDto(saved);
  }

  async findAll(): Promise<LineaResponseDto[]> {
    const lineas = await this.lineaRepository.find();
    return lineas.map((l) => this.toResponseDto(l));
  }

  async findOne(id: string): Promise<LineaResponseDto> {
    const linea = await this.lineaRepository.findOne({
      where: { idLinea: id },
    });
    if (!linea) {
      throw new NotFoundException(`Línea con ID ${id} no encontrada`);
    }
    return this.toResponseDto(linea);
  }

  async update(
    id: string,
    updateLineaDto: UpdateLineaDto
  ): Promise<LineaResponseDto> {
    const linea = await this.lineaRepository.findOne({
      where: { idLinea: id },
    });
    if (!linea) {
      throw new NotFoundException(`Línea con ID ${id} no encontrada`);
    }

    // Validate FK if provided; an explicit null clears the parqueo.
    if (updateLineaDto.idParqueo) {
      await validateForeignKey(
        this.parqueoRepository,
        updateLineaDto.idParqueo,
        "idParqueo",
        "Parqueo"
      );
    }

    Object.assign(linea, updateLineaDto);
    const updated = await this.lineaRepository.save(linea);
    return this.toResponseDto(updated);
  }

  async remove(id: string): Promise<void> {
    const linea = await this.lineaRepository.findOne({
      where: { idLinea: id },
    });
    if (!linea) {
      throw new NotFoundException(`Línea con ID ${id} no encontrada`);
    }

    // Soft delete: set status to INACTIVA (the DB CHECK constraint only
    // allows ACTIVA/INACTIVA for estado_linea).
    linea.estadoLinea = EstadoLinea.INACTIVA;
    await this.lineaRepository.save(linea);
  }

  // ---------------------------------------------------------------------------
  // Parada sequence management (tbl_linea_parada)
  // ---------------------------------------------------------------------------

  async listParadas(lineaId: string): Promise<LineaParadaEntity[]> {
    await this.ensureLineaExists(lineaId);
    return this.lineaParadaRepository.find({
      where: { idLinea: lineaId },
      relations: { parada: true },
      order: { orden: "ASC" },
    });
  }

  async addParada(
    lineaId: string,
    dto: AddLineaParadaDto
  ): Promise<LineaParadaEntity> {
    await this.ensureLineaExists(lineaId);
    await validateForeignKey(
      this.paradaRepository,
      dto.idParada,
      "idParada",
      "Parada"
    );

    const sameParada = await this.lineaParadaRepository.findOne({
      where: { idLinea: lineaId, idParada: dto.idParada },
    });
    if (sameParada) {
      throw new ConflictException(
        `La parada ${dto.idParada} ya está asignada a la línea ${lineaId}`,
        "PARADA_ALREADY_IN_LINEA"
      );
    }

    await this.ensureOrdenAvailable(lineaId, dto.orden);

    const record = this.lineaParadaRepository.create({
      idLinea: lineaId,
      idParada: dto.idParada,
      orden: dto.orden,
      minutosHastaSiguiente: dto.minutosHastaSiguiente,
    });
    return this.lineaParadaRepository.save(record);
  }

  async updateParada(
    lineaId: string,
    lineaParadaId: string,
    dto: UpdateLineaParadaDto
  ): Promise<LineaParadaEntity> {
    const record = await this.findLineaParadaOrFail(lineaId, lineaParadaId);

    if (dto.orden !== undefined && dto.orden !== record.orden) {
      await this.ensureOrdenAvailable(lineaId, dto.orden, lineaParadaId);
      record.orden = dto.orden;
    }
    if (dto.minutosHastaSiguiente !== undefined) {
      record.minutosHastaSiguiente = dto.minutosHastaSiguiente;
    }

    return this.lineaParadaRepository.save(record);
  }

  async removeParada(lineaId: string, lineaParadaId: string): Promise<void> {
    const record = await this.findLineaParadaOrFail(lineaId, lineaParadaId);

    // The minimum only guards removal: a new línea must be able to receive
    // its first paradas one by one.
    const total = await this.lineaParadaRepository.count({
      where: { idLinea: lineaId },
    });
    if (total - 1 < LINEA_MIN_PARADAS) {
      throw new ConflictException(
        `La línea ${lineaId} debe conservar al menos ${LINEA_MIN_PARADAS} paradas`,
        "LINEA_MIN_PARADAS"
      );
    }

    await this.lineaParadaRepository.remove(record);
  }

  /**
   * Rewrites the whole sequence in one transaction: position i of
   * `idsLineaParada` gets orden i + 1; minutosHastaSiguiente is untouched.
   *
   * UNIQUE (id_linea, orden) is not deferrable and CHECK (orden > 0) forbids
   * negatives, so a plain swap would collide mid-statement. Phase 1 shifts
   * every row above the current max orden (old values <= max, shifted values
   * > max, so no row ever collides); phase 2 writes the final 1..n values,
   * which are <= max and therefore never meet a shifted value.
   */
  async reorderParadas(
    lineaId: string,
    dto: ReorderLineaParadasDto
  ): Promise<LineaParadaEntity[]> {
    await this.ensureLineaExists(lineaId);
    const ids = dto.idsLineaParada.map(String);

    return this.lineaParadaRepository.manager.transaction(async (manager) => {
      const current = await manager.find(LineaParadaEntity, {
        where: { idLinea: lineaId },
      });
      this.ensureSameSequence(lineaId, ids, current);

      if (current.length > 0) {
        const maxOrden = Math.max(...current.map((r) => r.orden));
        await manager.increment(
          LineaParadaEntity,
          { idLinea: lineaId },
          "orden",
          maxOrden
        );
        for (const [index, idLineaParada] of ids.entries()) {
          await manager.update(
            LineaParadaEntity,
            { idLineaParada, idLinea: lineaId },
            { orden: index + 1 }
          );
        }
      }

      return manager.find(LineaParadaEntity, {
        where: { idLinea: lineaId },
        relations: { parada: true },
        order: { orden: "ASC" },
      });
    });
  }

  private ensureSameSequence(
    lineaId: string,
    ids: string[],
    current: LineaParadaEntity[]
  ): void {
    const requested = new Set(ids);
    const existing = new Set(current.map((r) => String(r.idLineaParada)));
    const matches =
      requested.size === ids.length &&
      requested.size === existing.size &&
      ids.every((id) => existing.has(id));
    if (!matches) {
      throw new BadRequestException(
        `La lista debe contener exactamente una vez cada parada actual de la línea ${lineaId}`,
        "ORDEN_LIST_MISMATCH"
      );
    }
  }

  private async ensureLineaExists(lineaId: string): Promise<void> {
    const linea = await this.lineaRepository.findOne({
      where: { idLinea: lineaId },
    });
    if (!linea) {
      throw new NotFoundException(`Línea con ID ${lineaId} no encontrada`);
    }
  }

  private async findLineaParadaOrFail(
    lineaId: string,
    lineaParadaId: string
  ): Promise<LineaParadaEntity> {
    const record = await this.lineaParadaRepository.findOne({
      where: { idLineaParada: lineaParadaId, idLinea: lineaId },
    });
    if (!record) {
      throw new NotFoundException(
        `Parada de línea con ID ${lineaParadaId} no encontrada en la línea ${lineaId}`
      );
    }
    return record;
  }

  private async ensureOrdenAvailable(
    lineaId: string,
    orden: number,
    excludeLineaParadaId?: string
  ): Promise<void> {
    const existing = await this.lineaParadaRepository.findOne({
      where: { idLinea: lineaId, orden },
    });
    if (existing && existing.idLineaParada !== excludeLineaParadaId) {
      throw new ConflictException(
        `El orden ${orden} ya está ocupado en la línea ${lineaId}`,
        "ORDEN_DUPLICATE"
      );
    }
  }

  private toResponseDto(linea: LineaEntity): LineaResponseDto {
    return toLineaResponseDto(linea);
  }
}
