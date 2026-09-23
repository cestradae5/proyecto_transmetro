import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { CreateParadaDto } from "./dto/create-parada.dto.js";
import { UpdateParadaDto } from "./dto/update-parada.dto.js";
import { EstadoParada, ParadaEntity } from "./parada.entity.js";

@Injectable()
export class ParadaService {
  constructor(
    @InjectRepository(ParadaEntity)
    private readonly paradaRepository: Repository<ParadaEntity>,
  ) {}

  async create(dto: CreateParadaDto): Promise<ParadaEntity> {
    const parada = this.paradaRepository.create(dto);
    return this.paradaRepository.save(parada);
  }

  async findAll(): Promise<ParadaEntity[]> {
    return this.paradaRepository.find();
  }

  async findOne(id: string): Promise<ParadaEntity> {
    const parada = await this.paradaRepository.findOne({
      where: { idParada: id },
    });

    if (!parada) {
      throw new NotFoundException(`Parada con ID ${id} no encontrada`);
    }

    return parada;
  }

  async update(id: string, dto: UpdateParadaDto): Promise<ParadaEntity> {
    await this.findOne(id);
    await this.paradaRepository.update({ idParada: id }, dto);
    return this.findOne(id);
  }

  async remove(id: string, force = false): Promise<void> {
    const parada = await this.findOne(id);

    if (force) {
      await this.paradaRepository.remove(parada);
    } else {
      await this.paradaRepository.update(
        { idParada: id },
        { estadoParada: EstadoParada.CERRADA },
      );
    }
  }
}
