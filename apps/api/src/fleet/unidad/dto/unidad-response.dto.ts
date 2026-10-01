import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import { ParqueoResponseDto } from "../../../infrastructure/parqueo/dto/parqueo-response.dto.js";
import { EstadoUnidad } from "../unidad.entity.js";

// Full response shape per design.md Interfaces/Contracts. `parqueo`/
// `idLinea`/`idEmpleadoPiloto` are populated by UnidadService starting this
// slice: it queries tbl_asignacion_unidad/tbl_asignacion_piloto directly
// (raw SQL against the baseline tables, not their Slice 3/4 TypeORM
// entities) and composes `parqueo` via LineaService/ParqueoService
// (design.md Decision 8). `idLineaParadaActual`/`fechaReporteUbicacion`
// stay `undefined` (omitted from JSON, not `null`) until Slice 3 adds the
// location-reporting columns on AsignacionUnidadEntity.
export class UnidadResponseDto {
  @ApiProperty({ description: "ID de la unidad" })
  idUnidad!: string;

  @ApiProperty({ description: "Número de placa del vehículo" })
  numeroPlaca!: string;

  @ApiProperty({ description: "Marca del vehículo" })
  marca!: string;

  @ApiProperty({ description: "Modelo del vehículo" })
  modelo!: string;

  @ApiProperty({ description: "Año del vehículo" })
  anio!: number;

  @ApiProperty({ description: "Capacidad de pasajeros" })
  capacidadPasajeros!: number;

  @ApiProperty({ description: "Estado de la unidad", enum: EstadoUnidad })
  estadoUnidad!: EstadoUnidad;

  @ApiProperty({ description: "Fecha de registro" })
  fechaRegistro!: Date;

  @ApiProperty({ description: "Fecha de última actualización" })
  fechaActualizacion!: Date;

  @ApiPropertyOptional({ description: "ID de la línea asignada (si existe)" })
  idLinea?: string;

  @ApiPropertyOptional({ description: "Parqueo derivado de la línea asignada" })
  parqueo?: ParqueoResponseDto;

  @ApiPropertyOptional({ description: "ID del empleado piloto asignado (si existe)" })
  idEmpleadoPiloto?: string;

  @ApiPropertyOptional({ description: "ID de la última parada reportada (si existe)" })
  idLineaParadaActual?: string;

  @ApiPropertyOptional({ description: "Fecha del último reporte de ubicación" })
  fechaReporteUbicacion?: Date;
}
