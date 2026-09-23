import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ParqueoEntity } from "./parqueo.entity.js";
import { CreateParqueoDto } from "./dto/create-parqueo.dto.js";
import { UpdateParqueoDto } from "./dto/update-parqueo.dto.js";
import { ParqueoResponseDto } from "./dto/parqueo-response.dto.js";
import { validateForeignKey } from "../shared/validators.js";
import { EstacionEntity } from "../estacion/estacion.entity.js";

@Injectable()
export class ParqueoService {
  constructor(
    @InjectRepository(ParqueoEntity)
    private readonly parqueoRepository: Repository<ParqueoEntity>,
    @InjectRepository(EstacionEntity)
    private readonly estacionRepository: Repository<EstacionEntity>
  ) {}

  async create(createParqueoDto: CreateParqueoDto): Promise<ParqueoResponseDto> {
    // Validate FK
    await validateForeignKey(
      this.estacionRepository,
      createParqueoDto.idEstacion,
      "idEstacion",
      "Estación"
    );

    const parqueo = this.parqueoRepository.create(createParqueoDto);
    const saved = await this.parqueoRepository.save(parqueo);
    return this.toResponseDto(saved);
  }

  async findAll(): Promise<ParqueoResponseDto[]> {
    const parqueos = await this.parqueoRepository.find();
    return parqueos.map((p) => this.toResponseDto(p));
  }

  async findOne(id: string): Promise<ParqueoResponseDto> {
    const parqueo = await this.parqueoRepository.findOne({
      where: { idParqueo: id },
    });
    if (!parqueo) {
      throw new NotFoundException(`Parqueo con ID ${id} no encontrado`);
    }
    return this.toResponseDto(parqueo);
  }

  async update(
    id: string,
    updateParqueoDto: UpdateParqueoDto
  ): Promise<ParqueoResponseDto> {
    const parqueo = await this.parqueoRepository.findOne({
      where: { idParqueo: id },
    });
    if (!parqueo) {
      throw new NotFoundException(`Parqueo con ID ${id} no encontrado`);
    }

    // Validate FK if provided
    if (updateParqueoDto.idEstacion) {
      await validateForeignKey(
        this.estacionRepository,
        updateParqueoDto.idEstacion,
        "idEstacion",
        "Estación"
      );
    }

    Object.assign(parqueo, updateParqueoDto);
    const updated = await this.parqueoRepository.save(parqueo);
    return this.toResponseDto(updated);
  }

  async remove(id: string): Promise<void> {
    const parqueo = await this.parqueoRepository.findOne({
      where: { idParqueo: id },
    });
    if (!parqueo) {
      throw new NotFoundException(`Parqueo con ID ${id} no encontrado`);
    }

    // Soft delete: set status to CERRADO
    parqueo.estadoParqueo = "CERRADO" as any;
    await this.parqueoRepository.save(parqueo);
  }

  private toResponseDto(parqueo: ParqueoEntity): ParqueoResponseDto {
    return {
      idParqueo: parqueo.idParqueo,
      nombreParqueo: parqueo.nombreParqueo,
      tipoParqueo: parqueo.tipoParqueo,
      direccion: parqueo.direccion,
      latitud: parqueo.latitud,
      longitud: parqueo.longitud,
      capacidadUnidades: parqueo.capacidadUnidades,
      estadoParqueo: parqueo.estadoParqueo,
      idEstacion: parqueo.idEstacion,
    };
  }
}
