import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { ParadaEntity } from "../parada/parada.entity.js";
import { validateForeignKey } from "../shared/validators.js";
import { AccesoEntity, EstadoAcceso } from "./acceso.entity.js";
import { AccesoResponseDto } from "./dto/acceso-response.dto.js";
import { CreateAccesoDto } from "./dto/create-acceso.dto.js";
import { UpdateAccesoDto } from "./dto/update-acceso.dto.js";

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
    private readonly paradaRepository: Repository<ParadaEntity>
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
    dto: CreateAccesoDto
  ): Promise<AccesoResponseDto> {
    await this.ensureParadaExists(paradaId);
    const acceso = this.accesoRepository.create({
      ...dto,
      idParada: paradaId,
      estadoAcceso: dto.estadoAcceso ?? EstadoAcceso.HABILITADO,
    });
    const saved = await this.accesoRepository.save(acceso);
    return this.toResponseDto(saved);
  }

  async findOne(paradaId: string, accesoId: string): Promise<AccesoResponseDto> {
    const acceso = await this.findOrFail(paradaId, accesoId);
    return this.toResponseDto(acceso);
  }

  async update(
    paradaId: string,
    accesoId: string,
    dto: UpdateAccesoDto
  ): Promise<AccesoResponseDto> {
    const acceso = await this.findOrFail(paradaId, accesoId);
    Object.assign(acceso, dto);
    // The owning parada is fixed by the route and never changes on update.
    acceso.idParada = paradaId;
    const updated = await this.accesoRepository.save(acceso);
    return this.toResponseDto(updated);
  }

  async remove(paradaId: string, accesoId: string): Promise<void> {
    const acceso = await this.findOrFail(paradaId, accesoId);

    // Soft delete like the sibling infrastructure modules: the row is kept and
    // only marked DESHABILITADO, which the DB CHECK allows.
    acceso.estadoAcceso = EstadoAcceso.DESHABILITADO;
    await this.accesoRepository.save(acceso);
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
