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
import { InfrastructureAuditService } from "../shared/infrastructure-audit.service.js";
import { AfectacionService } from "../afectacion/afectacion.service.js";
import { AccionAfectacion } from "../afectacion/afectacion.entity.js";
import {
  INFRASTRUCTURE_AUDIT_ACTIONS,
  INFRASTRUCTURE_ENTITY_TYPES,
} from "../shared/infrastructure-audit.constants.js";

/** Minimum number of paradas a línea must keep once its sequence is built. */
export const LINEA_MIN_PARADAS = 2;

const MOTIVO_DESACTIVADA = "Desactivada desde Líneas";
const MOTIVO_ACTIVADA = "Activada desde Líneas";

/** Today as YYYY-MM-DD in the server's local time zone. */
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

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
    private readonly paradaRepository: Repository<ParadaEntity>,
    private readonly audit: InfrastructureAuditService,
    private readonly afectaciones: AfectacionService
  ) {}

  async create(
    createLineaDto: CreateLineaDto,
    actorEmployeeId: string
  ): Promise<LineaResponseDto> {
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

    const saved = await this.lineaRepository.manager.transaction(
      async (manager) => {
        const repo = manager.getRepository(LineaEntity);
        const linea = repo.create({
          ...createLineaDto,
          idParqueo: createLineaDto.idParqueo ?? null,
        });
        const persisted = await repo.save(linea);
        await this.audit.record(manager, actorEmployeeId, {
          action: INFRASTRUCTURE_AUDIT_ACTIONS.CREATE,
          entityType: INFRASTRUCTURE_ENTITY_TYPES.LINEA,
          entityId: String(persisted.idLinea),
          detalle: {
            numeroLinea: persisted.numeroLinea,
            nombreLinea: persisted.nombreLinea,
          },
        });
        return persisted;
      }
    );
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
    updateLineaDto: UpdateLineaDto,
    actorEmployeeId: string
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

    const changedFields = Object.keys(updateLineaDto);
    const updated = await this.lineaRepository.manager.transaction(
      async (manager) => {
        // An estado change goes through an afectación, so it cascades to the
        // exclusive paradas/estaciones like one made from Afectaciones. The
        // engine compares the estado under its row lock (no afectación when it
        // already matches). It runs first, in the engine's lock order; the row
        // is then re-read under the lock so the save never writes back a stale
        // estado.
        if (updateLineaDto.estadoLinea !== undefined) {
          const activar = updateLineaDto.estadoLinea === EstadoLinea.ACTIVA;
          await this.afectaciones.aplicarSiCambia(
            manager,
            {
              accion: activar ? AccionAfectacion.ACTIVAR : AccionAfectacion.DESACTIVAR,
              motivo: activar ? MOTIVO_ACTIVADA : MOTIVO_DESACTIVADA,
              fechaInicio: today(),
              idLinea: id,
            },
            actorEmployeeId
          );
        }
        const repo = manager.getRepository(LineaEntity);
        const actual = await this.lockOrFail(repo, id);
        Object.assign(actual, updateLineaDto);
        const persisted = await repo.save(actual);
        await this.audit.record(manager, actorEmployeeId, {
          action: INFRASTRUCTURE_AUDIT_ACTIONS.UPDATE,
          entityType: INFRASTRUCTURE_ENTITY_TYPES.LINEA,
          entityId: String(id),
          detalle: { changedFields },
        });
        return persisted;
      }
    );
    return this.toResponseDto(updated);
  }

  async remove(id: string, actorEmployeeId: string): Promise<void> {
    await this.ensureLineaExists(id);

    // Soft delete: the row is kept and only marked INACTIVA, through a
    // DESACTIVAR afectación so its exclusive paradas and estaciones close too.
    // An already INACTIVA línea has nothing left to deactivate; the engine
    // decides that under the row lock, so of two concurrent deletes the second
    // one creates no afectación.
    await this.lineaRepository.manager.transaction(async (manager) => {
      await this.afectaciones.aplicarSiCambia(
        manager,
        {
          accion: AccionAfectacion.DESACTIVAR,
          motivo: MOTIVO_DESACTIVADA,
          fechaInicio: today(),
          idLinea: id,
        },
        actorEmployeeId
      );
      const linea = await this.lockOrFail(manager.getRepository(LineaEntity), id);
      await this.audit.record(manager, actorEmployeeId, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.REMOVE,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.LINEA,
        entityId: String(id),
        detalle: { numeroLinea: linea.numeroLinea },
      });
    });
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
    dto: AddLineaParadaDto,
    actorEmployeeId: string
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

    return this.lineaParadaRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(LineaParadaEntity);
      const record = repo.create({
        idLinea: lineaId,
        idParada: dto.idParada,
        orden: dto.orden,
        minutosHastaSiguiente: dto.minutosHastaSiguiente,
      });
      const persisted = await repo.save(record);
      await this.audit.record(manager, actorEmployeeId, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.LINK,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.LINEA_PARADA,
        entityId: String(lineaId),
        detalle: { idParada: dto.idParada, orden: dto.orden },
      });
      return persisted;
    });
  }

  async updateParada(
    lineaId: string,
    lineaParadaId: string,
    dto: UpdateLineaParadaDto,
    actorEmployeeId: string
  ): Promise<LineaParadaEntity> {
    const record = await this.findLineaParadaOrFail(lineaId, lineaParadaId);

    if (dto.orden !== undefined && dto.orden !== record.orden) {
      await this.ensureOrdenAvailable(lineaId, dto.orden, lineaParadaId);
      record.orden = dto.orden;
    }
    if (dto.minutosHastaSiguiente !== undefined) {
      record.minutosHastaSiguiente = dto.minutosHastaSiguiente;
    }

    const changedFields = Object.keys(dto);
    return this.lineaParadaRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(LineaParadaEntity);
      const persisted = await repo.save(record);
      await this.audit.record(manager, actorEmployeeId, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.UPDATE,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.LINEA_PARADA,
        entityId: String(lineaId),
        detalle: { lineaParadaId, changedFields },
      });
      return persisted;
    });
  }

  async removeParada(
    lineaId: string,
    lineaParadaId: string,
    actorEmployeeId: string
  ): Promise<void> {
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

    await this.lineaParadaRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(LineaParadaEntity);
      await repo.remove(record);
      await this.audit.record(manager, actorEmployeeId, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.UNLINK,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.LINEA_PARADA,
        entityId: String(lineaId),
        detalle: { lineaParadaId, idParada: record.idParada },
      });
    });
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
    dto: ReorderLineaParadasDto,
    actorEmployeeId: string
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
        await this.audit.record(manager, actorEmployeeId, {
          action: INFRASTRUCTURE_AUDIT_ACTIONS.REORDER,
          entityType: INFRASTRUCTURE_ENTITY_TYPES.LINEA_PARADA,
          entityId: String(lineaId),
          detalle: { orden: ids },
        });
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

  /** Re-reads the row inside the transaction, locked FOR UPDATE. */
  private async lockOrFail(
    repo: Repository<LineaEntity>,
    id: string
  ): Promise<LineaEntity> {
    const linea = await repo.findOne({
      where: { idLinea: id },
      lock: { mode: "pessimistic_write" },
    });
    if (!linea) {
      throw new NotFoundException(`Línea con ID ${id} no encontrada`);
    }
    return linea;
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
