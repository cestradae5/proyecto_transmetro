import { ApiProperty } from "@nestjs/swagger";
import { EstadoLinea, TipoRecorrido } from "./create-linea.dto.js";
import type { LineaEntity } from "../linea.entity.js";

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

/** Maps a línea entity to its response shape (shared by every línea listing). */
export function toLineaResponseDto(linea: LineaEntity): LineaResponseDto {
  return {
    idLinea: linea.idLinea,
    numeroLinea: linea.numeroLinea,
    nombreLinea: linea.nombreLinea,
    colorHex: linea.colorHex,
    estadoLinea: linea.estadoLinea as unknown as EstadoLinea,
    tipoRecorrido: linea.tipoRecorrido as unknown as TipoRecorrido,
    idParqueo: linea.idParqueo ?? null,
  };
}
