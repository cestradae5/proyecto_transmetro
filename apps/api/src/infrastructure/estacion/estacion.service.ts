import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EstacionEntity } from "./estacion.entity.js";
import { CreateEstacionDto } from "./dto/create-estacion.dto.js";
import { UpdateEstacionDto } from "./dto/update-estacion.dto.js";
import { EstacionResponseDto } from "./dto/estacion-response.dto.js";
import { validateForeignKey } from "../shared/validators.js";
import { ParadaEntity } from "../parada/parada.entity.js";

@Injectable()
export class EstacionService {
  constructor(
    @InjectRepository(EstacionEntity)
    private readonly estacionRepository: Repository<EstacionEntity>,
    @InjectRepository(ParadaEntity)
    private readonly paradaRepository: Repository<ParadaEntity>
  ) {}

  async create(
    createEstacionDto: CreateEstacionDto
  ): Promise<EstacionResponseDto> {
    // Validate FK if provided
    if (createEstacionDto.idParada) {
      await validateForeignKey(
        this.paradaRepository,
        createEstacionDto.idParada,
        "idParada",
        "Parada"
      );

      const parada = await this.paradaRepository.findOne({
        where: { idParada: createEstacionDto.idParada },
      });
      if (parada) {
        const estacion = this.estacionRepository.create(createEstacionDto);
        estacion.parada = parada;
        estacion.idParada = parada.idParada;
        const saved = await this.estacionRepository.save(estacion);
        return this.toResponseDto(saved);
      }
    }

    const estacion = this.estacionRepository.create(createEstacionDto);
    const saved = await this.estacionRepository.save(estacion);
    return this.toResponseDto(saved);
  }

  async findAll(): Promise<EstacionResponseDto[]> {
    const estaciones = await this.estacionRepository.find();
    return estaciones.map((e) => this.toResponseDto(e));
  }

  async findOne(id: string): Promise<EstacionResponseDto> {
    const estacion = await this.estacionRepository.findOne({
      where: { idEstacion: Number(id) },
    });
    if (!estacion) {
      throw new NotFoundException(`Estación con ID ${id} no encontrada`);
    }
    return this.toResponseDto(estacion);
  }

  async update(
    id: string,
    updateEstacionDto: UpdateEstacionDto
  ): Promise<EstacionResponseDto> {
    const estacion = await this.estacionRepository.findOne({
      where: { idEstacion: Number(id) },
    });
    if (!estacion) {
      throw new NotFoundException(`Estación con ID ${id} no encontrada`);
    }

    // Validate FK if provided
    if (updateEstacionDto.idParada) {
      await validateForeignKey(
        this.paradaRepository,
        updateEstacionDto.idParada,
        "idParada",
        "Parada"
      );
    }

    Object.assign(estacion, updateEstacionDto);
    const updated = await this.estacionRepository.save(estacion);
    return this.toResponseDto(updated);
  }

  async remove(id: string): Promise<void> {
    const estacion = await this.estacionRepository.findOne({
      where: { idEstacion: Number(id) },
    });
    if (!estacion) {
      throw new NotFoundException(`Estación con ID ${id} no encontrada`);
    }

    // Soft delete: set status to CERRADA
    estacion.estadoEstacion = "CERRADA";
    await this.estacionRepository.save(estacion);
  }

  private toResponseDto(estacion: EstacionEntity): EstacionResponseDto {
    return {
      idEstacion: estacion.idEstacion,
      nombreEstacion: estacion.nombreEstacion,
      latitud: estacion.latitud,
      longitud: estacion.longitud,
      estadoEstacion: estacion.estadoEstacion as any,
      idParada: estacion.idParada,
    };
  }
}
