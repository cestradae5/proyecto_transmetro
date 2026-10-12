import { ApiProperty } from "@nestjs/swagger";
import { EstadoLinea, TipoRecorrido } from "./create-linea.dto.js";

export class LineaResponseDto {
  @ApiProperty({ description: "ID de la línea" })
  idLinea!: string;

  @ApiProperty({ description: "Número de línea" })
  numeroLinea!: string;

  @ApiProperty({ description: "Nombre de la línea" })
  nombreLinea!: string;

  @ApiProperty({ description: "Color en formato hexadecimal" })
  colorHex!: string;

  @ApiProperty({ description: "Estado de la línea", enum: EstadoLinea })
  estadoLinea!: EstadoLinea;

  @ApiProperty({ description: "Tipo de recorrido", enum: TipoRecorrido })
  tipoRecorrido!: TipoRecorrido;

  @ApiProperty({
    description: "ID del parqueo asociado (null si aún no tiene parqueo)",
    nullable: true,
    type: String,
  })
  idParqueo!: string | null;
}
