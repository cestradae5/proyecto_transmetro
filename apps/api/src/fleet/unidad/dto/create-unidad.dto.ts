import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

import { EstadoUnidad } from "../unidad.entity.js";

// Validadores mapeados a las restricciones de tbl_unidad (design.md
// Decision 7). `anio` no tiene @Min/@Max: ni la DB (sin CHECK de rango) ni
// el spec definen un límite, así que no se inventa una regla.
export class CreateUnidadDto {
  @ApiProperty({ description: "Número de placa del vehículo", maxLength: 20 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  numeroPlaca!: string;

  @ApiProperty({ description: "Marca del vehículo", maxLength: 60 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  marca!: string;

  @ApiProperty({ description: "Modelo del vehículo", maxLength: 60 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  modelo!: string;

  @ApiProperty({ description: "Año del vehículo" })
  @IsInt()
  anio!: number;

  @ApiProperty({ description: "Capacidad de pasajeros", minimum: 1 })
  @IsInt()
  @Min(1)
  capacidadPasajeros!: number;

  // Opcional y solo para permitir el rechazo explícito de creación
  // EN_SERVICIO (spec: "Attempt to create directly as EN_SERVICIO").
  // La creación siempre fuerza DISPONIBLE server-side cuando se omite.
  @ApiPropertyOptional({
    description:
      "Estado inicial (opcional). Solo DISPONIBLE es aceptado; cualquier otro valor es rechazado con 409.",
    enum: EstadoUnidad,
  })
  @IsOptional()
  @IsEnum(EstadoUnidad)
  estadoUnidad?: EstadoUnidad;
}
