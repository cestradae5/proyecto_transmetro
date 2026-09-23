import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AfectacionEntity } from "./afectacion.entity.js";
import { CreateAfectacionDto } from "./dto/create-afectacion.dto.js";
import { UpdateAfectacionDto } from "./dto/update-afectacion.dto.js";
import { AfectacionResponseDto } from "./dto/afectacion-response.dto.js";
import { validateForeignKey } from "../shared/validators.js";
import { ParadaEntity } from "../parada/parada.entity.js";
import { EstacionEntity } from "../estacion/estacion.entity.js";

@Injectable()
export class AfectacionService {
  constructor(
    @InjectRepository(AfectacionEntity)
    private readonly afectacionRepository: Repository<AfectacionEntity>,
    @InjectRepository(ParadaEntity)
    private readonly paradaRepository: Repository<ParadaEntity>,
    @InjectRepository(EstacionEntity)
    private readonly estacionRepository: Repository<EstacionEntity>
  ) {}

  async create(
    createAfectacionDto: CreateAfectacionDto
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

    const afectacion = this.afectacionRepository.create(createAfectacionDto);
    const saved = await this.afectacionRepository.save(afectacion);
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
    updateAfectacionDto: UpdateAfectacionDto
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

    Object.assign(afectacion, updateAfectacionDto);
    const updated = await this.afectacionRepository.save(afectacion);
    return this.toResponseDto(updated);
  }

  async remove(id: string): Promise<void> {
    const afectacion = await this.afectacionRepository.findOne({
      where: { idAfectacion: id },
    });
    if (!afectacion) {
      throw new NotFoundException(`Afectación con ID ${id} no encontrada`);
    }

    // Soft delete: set status to CERRADA
    afectacion.estadoAfectacion = "CERRADA" as any;
    await this.afectacionRepository.save(afectacion);
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
