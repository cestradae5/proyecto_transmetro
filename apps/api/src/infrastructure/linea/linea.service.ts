import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { LineaEntity } from "./linea.entity.js";
import { CreateLineaDto } from "./dto/create-linea.dto.js";
import { UpdateLineaDto } from "./dto/update-linea.dto.js";
import { LineaResponseDto } from "./dto/linea-response.dto.js";
import { validateForeignKey } from "../shared/validators.js";
import { ParqueoEntity } from "../parqueo/parqueo.entity.js";

@Injectable()
export class LineaService {
  constructor(
    @InjectRepository(LineaEntity)
    private readonly lineaRepository: Repository<LineaEntity>,
    @InjectRepository(ParqueoEntity)
    private readonly parqueoRepository: Repository<ParqueoEntity>
  ) {}

  async create(createLineaDto: CreateLineaDto): Promise<LineaResponseDto> {
    // Validate FK
    await validateForeignKey(
      this.parqueoRepository,
      createLineaDto.idParqueo,
      "idParqueo",
      "Parqueo"
    );

    const linea = this.lineaRepository.create(createLineaDto);
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

    // Validate FK if provided
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

    // Soft delete: set status to CERRADA
    linea.estadoLinea = "CERRADA" as any;
    await this.lineaRepository.save(linea);
  }

  private toResponseDto(linea: LineaEntity): LineaResponseDto {
    return {
      idLinea: linea.idLinea,
      numeroLinea: linea.numeroLinea,
      nombreLinea: linea.nombreLinea,
      colorHex: linea.colorHex,
      estadoLinea: linea.estadoLinea,
      tipoRecorrido: linea.tipoRecorrido,
      idParqueo: linea.idParqueo,
    };
  }
}
