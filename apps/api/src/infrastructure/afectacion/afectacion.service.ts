import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { EntityManager, Repository } from "typeorm";
import { AccionAfectacion, AfectacionEntity } from "./afectacion.entity.js";
import { CreateAfectacionDto } from "./dto/create-afectacion.dto.js";
import { UpdateAfectacionDto } from "./dto/update-afectacion.dto.js";
import { AfectacionCambioDto, AfectacionResponseDto } from "./dto/afectacion-response.dto.js";
import { AfectacionEngine, ENTIDAD_KINDS, type PlanCambios } from "./afectacion-engine.js";
import {
  AFECTACION_STORE_FACTORY,
  type AfectacionRegistro,
  type AfectacionStore,
  type AfectacionStoreFactory,
  type CambioRegistrado,
  type EntidadRef,
} from "./afectacion.store.js";
import { InfrastructureAuditService } from "../shared/infrastructure-audit.service.js";
import {
  INFRASTRUCTURE_AUDIT_ACTIONS,
  INFRASTRUCTURE_ENTITY_TYPES,
} from "../shared/infrastructure-audit.constants.js";

const EDITABLE_FIELDS = ["accion", "motivo", "fechaInicio", "fechaFin"] as const;

type Target = { tipo: EntidadRef["tipo"]; id: string | null | undefined };

function targetsOf(source: {
  idMunicipalidad?: string | null;
  idLinea?: string | null;
  idParada?: string | null;
  idEstacion?: string | null;
}): EntidadRef[] {
  const all: Target[] = [
    { tipo: "municipalidad", id: source.idMunicipalidad },
    { tipo: "linea", id: source.idLinea },
    { tipo: "parada", id: source.idParada },
    { tipo: "estacion", id: source.idEstacion },
  ];
  return all.filter((t): t is EntidadRef => Boolean(t.id));
}

function sinCambio(target: EntidadRef, activar: boolean): ConflictException {
  return new ConflictException(
    `${ENTIDAD_KINDS[target.tipo].article} ya está ${activar ? "activa" : "inactiva"}`,
    "AFECTACION_SIN_CAMBIO"
  );
}

function noEncontrado(target: EntidadRef): NotFoundException {
  return new NotFoundException(`${ENTIDAD_KINDS[target.tipo].label} con ID ${target.id} no encontrada`);
}

function fechasInvalidas(fechaInicio: string, fechaFin: string | null | undefined): boolean {
  return Boolean(fechaFin) && new Date(fechaFin!) < new Date(fechaInicio);
}

@Injectable()
export class AfectacionService {
  constructor(
    @InjectRepository(AfectacionEntity)
    private readonly afectacionRepository: Repository<AfectacionEntity>,
    private readonly audit: InfrastructureAuditService,
    @Inject(AFECTACION_STORE_FACTORY)
    private readonly storeFor: AfectacionStoreFactory
  ) {}

  /** Applies a new afectación in its own transaction. */
  async create(dto: CreateAfectacionDto, actorEmployeeId: string): Promise<AfectacionResponseDto> {
    return this.afectacionRepository.manager.transaction((manager) =>
      this.aplicar(manager, dto, actorEmployeeId)
    );
  }

  /**
   * Applies an afectación inside the caller's transaction (also used by
   * MunicipalidadService): changes the target and its cascade, stores the
   * afectación and every change, and writes one bitácora row. Dates are
   * informative: nothing reverts automatically. Every check runs before the
   * first write.
   */
  async aplicar(
    manager: EntityManager,
    dto: CreateAfectacionDto,
    actorEmployeeId: string
  ): Promise<AfectacionResponseDto> {
    const targets = targetsOf(dto);
    if (targets.length !== 1) {
      throw new BadRequestException(
        "Debe proporcionar exactamente uno: idMunicipalidad, idLinea, idParada o idEstacion"
      );
    }
    if (fechasInvalidas(dto.fechaInicio, dto.fechaFin)) {
      throw new BadRequestException("La fecha de fin no puede ser anterior a la fecha de inicio");
    }
    const target = targets[0]!;
    const activar = dto.accion === AccionAfectacion.ACTIVAR;
    const store = this.storeFor(manager);
    const engine = new AfectacionEngine(store);

    // ACTIVAR restores what the target's last DESACTIVAR still in effect changed (S8).
    let revertidos: CambioRegistrado[] = [];
    const plan = activar
      ? await engine.planActivar(target, async () => {
          const idDesactivacion = await store.ultimaDesactivacionVigente(target);
          revertidos = idDesactivacion ? await store.cambiosVigentes(idDesactivacion) : [];
          return revertidos;
        })
      : await engine.planDesactivar(target);
    this.assertAplicable(target, activar, plan);

    await engine.aplicar(plan);
    const registro: Omit<AfectacionRegistro, "idAfectacion"> = {
      tipoAfectacion: dto.accion,
      motivo: dto.motivo,
      fechaInicio: dto.fechaInicio,
      fechaFin: dto.fechaFin ?? null,
      idMunicipalidad: dto.idMunicipalidad ?? null,
      idLinea: dto.idLinea ?? null,
      idParada: dto.idParada ?? null,
      idEstacion: dto.idEstacion ?? null,
    };
    const idAfectacion = await store.insertarAfectacion(registro);
    await store.insertarCambios(idAfectacion, plan.cambios);
    await store.marcarRevertidos(revertidos.map((c) => c.idCambio));
    await this.auditarAccion(manager, actorEmployeeId, target, activar, { ...registro, idAfectacion }, plan);

    return this.toResponse(
      { ...registro, idAfectacion },
      plan.cambios.map((c) => ({ ...c, revertido: false }))
    );
  }

  /**
   * Edits an afectación (S10). motivo and fechas are always editable. Changing
   * the acción applies it, and only on the target's most recent afectación:
   * DESACTIVAR→ACTIVAR reverts what this afectación changed (rows still in the
   * state it set), ACTIVAR→DESACTIVAR applies a fresh deactivation with
   * cascade. Either way its previous changes are marked revertido.
   */
  async update(
    id: string,
    dto: UpdateAfectacionDto,
    actorEmployeeId: string
  ): Promise<AfectacionResponseDto> {
    return this.afectacionRepository.manager.transaction(async (manager) => {
      const store = this.storeFor(manager);
      const actual = await store.bloquearAfectacion(id);
      if (!actual) {
        throw new NotFoundException(`Afectación con ID ${id} no encontrada`);
      }
      const merged: AfectacionRegistro = {
        ...actual,
        tipoAfectacion: dto.accion ?? actual.tipoAfectacion,
        motivo: dto.motivo ?? actual.motivo,
        fechaInicio: dto.fechaInicio ?? actual.fechaInicio,
        fechaFin: dto.fechaFin === undefined ? actual.fechaFin : dto.fechaFin,
      };
      if (fechasInvalidas(merged.fechaInicio, merged.fechaFin)) {
        throw new BadRequestException("La fecha de fin no puede ser anterior a la fecha de inicio");
      }
      const previo: Record<(typeof EDITABLE_FIELDS)[number], unknown> = {
        accion: actual.tipoAfectacion,
        motivo: actual.motivo,
        fechaInicio: actual.fechaInicio,
        fechaFin: actual.fechaFin,
      };
      const changedFields = EDITABLE_FIELDS.filter(
        (field) => dto[field] !== undefined && dto[field] !== previo[field]
      );

      if (changedFields.includes("accion")) {
        await this.cambiarAccion(manager, store, actual, merged, actorEmployeeId);
      }
      if (changedFields.length > 0) {
        await store.actualizarAfectacion(id, {
          tipoAfectacion: merged.tipoAfectacion,
          motivo: merged.motivo,
          fechaInicio: merged.fechaInicio,
          fechaFin: merged.fechaFin,
        });
        await this.audit.record(manager, actorEmployeeId, {
          action: INFRASTRUCTURE_AUDIT_ACTIONS.UPDATE,
          entityType: INFRASTRUCTURE_ENTITY_TYPES.AFECTACION,
          entityId: id,
          detalle: { changedFields },
        });
      }
      const cambios = (await store.cambiosDe([id])).get(id) ?? [];
      return this.toResponse(merged, cambios);
    });
  }

  private async cambiarAccion(
    manager: EntityManager,
    store: AfectacionStore,
    actual: AfectacionRegistro,
    merged: AfectacionRegistro,
    actorEmployeeId: string
  ): Promise<void> {
    const acciones: string[] = [AccionAfectacion.ACTIVAR, AccionAfectacion.DESACTIVAR];
    if (!acciones.includes(actual.tipoAfectacion)) {
      throw new ConflictException(
        "Las afectaciones anteriores a activar/desactivar no pueden cambiar de acción",
        "AFECTACION_ACCION_NO_EDITABLE"
      );
    }
    const target = targetsOf(actual)[0]!;
    const activar = merged.tipoAfectacion === AccionAfectacion.ACTIVAR;
    const engine = new AfectacionEngine(store);
    let vigentes: CambioRegistrado[] = [];
    const plan = activar
      ? await engine.planActivar(target, async () => (vigentes = await store.cambiosVigentes(actual.idAfectacion)))
      : await engine.planDesactivar(target);

    // Checked with the target locked, so no afectación can be added meanwhile.
    if ((await store.ultimaAfectacion(target)) !== actual.idAfectacion) {
      throw new ConflictException(
        "Solo la afectación más reciente de este objetivo puede cambiar de acción",
        "AFECTACION_NO_ES_ULTIMA"
      );
    }
    this.assertAplicable(target, activar, plan);
    if (!activar) vigentes = await store.cambiosVigentes(actual.idAfectacion);

    await engine.aplicar(plan);
    await store.marcarRevertidos(vigentes.map((c) => c.idCambio));
    await store.insertarCambios(actual.idAfectacion, plan.cambios);
    await this.auditarAccion(manager, actorEmployeeId, target, activar, merged, plan);
  }

  private assertAplicable(target: EntidadRef, activar: boolean, plan: PlanCambios): void {
    if (plan.estadoActual === null) throw noEncontrado(target);
    if (plan.cambios.length === 0) throw sinCambio(target, activar);
  }

  /** One activate/deactivate row on the target; detalle.cascada lists the other changes (S11). */
  private async auditarAccion(
    manager: EntityManager,
    actorEmployeeId: string,
    target: EntidadRef,
    activar: boolean,
    afectacion: AfectacionRegistro,
    plan: PlanCambios
  ): Promise<void> {
    const [objetivo, ...cascada] = plan.cambios;
    await this.audit.record(manager, actorEmployeeId, {
      action: activar ? INFRASTRUCTURE_AUDIT_ACTIONS.ACTIVATE : INFRASTRUCTURE_AUDIT_ACTIONS.DEACTIVATE,
      entityType: target.tipo,
      entityId: target.id,
      detalle: {
        idAfectacion: afectacion.idAfectacion,
        motivo: afectacion.motivo,
        fechaInicio: afectacion.fechaInicio,
        fechaFin: afectacion.fechaFin,
        estadoAnterior: objetivo!.estadoAnterior,
        estadoNuevo: objetivo!.estadoNuevo,
        cascada,
      },
    });
  }

  async findAll(): Promise<AfectacionResponseDto[]> {
    const afectaciones = await this.afectacionRepository.find({
      order: { fechaInicio: "DESC", idAfectacion: "DESC" },
    });
    const cambios = await this.storeFor(this.afectacionRepository.manager).cambiosDe(
      afectaciones.map((a) => String(a.idAfectacion))
    );
    return afectaciones.map((a) => this.toEntityResponse(a, cambios.get(String(a.idAfectacion)) ?? []));
  }

  async findOne(id: string): Promise<AfectacionResponseDto> {
    const afectacion = await this.afectacionRepository.findOne({
      where: { idAfectacion: id },
    });
    if (!afectacion) {
      throw new NotFoundException(`Afectación con ID ${id} no encontrada`);
    }
    const cambios = await this.storeFor(this.afectacionRepository.manager).cambiosDe([id]);
    return this.toEntityResponse(afectacion, cambios.get(id) ?? []);
  }

  private toEntityResponse(afectacion: AfectacionEntity, cambios: CambioRegistrado[]): AfectacionResponseDto {
    return this.toResponse(
      {
        idAfectacion: afectacion.idAfectacion,
        tipoAfectacion: afectacion.tipoAfectacion,
        motivo: afectacion.motivo,
        fechaInicio: afectacion.fechaInicio as string,
        fechaFin: (afectacion.fechaFin ?? null) as string | null,
        idMunicipalidad: afectacion.idMunicipalidad ?? null,
        idLinea: afectacion.idLinea ?? null,
        idParada: afectacion.idParada ?? null,
        idEstacion: afectacion.idEstacion ?? null,
      },
      cambios
    );
  }

  private toResponse(
    afectacion: AfectacionRegistro,
    cambios: Array<Omit<CambioRegistrado, "idCambio"> & { idCambio?: string }>
  ): AfectacionResponseDto {
    return {
      idAfectacion: afectacion.idAfectacion,
      accion: afectacion.tipoAfectacion,
      motivo: afectacion.motivo,
      fechaInicio: afectacion.fechaInicio,
      fechaFin: afectacion.fechaFin ?? null,
      idMunicipalidad: afectacion.idMunicipalidad ?? null,
      idLinea: afectacion.idLinea ?? null,
      idParada: afectacion.idParada ?? null,
      idEstacion: afectacion.idEstacion ?? null,
      cambios: cambios.map(
        (c): AfectacionCambioDto => ({
          entidadTipo: c.entidadTipo,
          entidadId: c.entidadId,
          estadoAnterior: c.estadoAnterior,
          estadoNuevo: c.estadoNuevo,
          revertido: c.revertido,
        })
      ),
    };
  }
}
