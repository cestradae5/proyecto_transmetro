import { ApiProperty } from "@nestjs/swagger";
import { TipoParqueo, EstadoParqueo } from "./create-parqueo.dto.js";

export class ParqueoResponseDto {
  @ApiProperty({ description: "ID del parqueo" })
  idParqueo!: string;

  @ApiProperty({ description: "Nombre del parqueo" })
  nombreParqueo!: string;

  @ApiProperty({ description: "Tipo de parqueo", enum: TipoParqueo })
  tipoParqueo!: TipoParqueo;

  @ApiProperty({ description: "Dirección del parqueo" })
  direccion!: string;

  @ApiProperty({ description: "Latitud" })
  latitud!: number;

  @ApiProperty({ description: "Longitud" })
  longitud!: number;

  @ApiProperty({ description: "Capacidad de unidades" })
  capacidadUnidades!: number;

  @ApiProperty({ description: "Estado del parqueo", enum: EstadoParqueo })
  estadoParqueo!: EstadoParqueo;

  @ApiProperty({ description: "ID de la estación asociada" })
  idEstacion!: string;
}
