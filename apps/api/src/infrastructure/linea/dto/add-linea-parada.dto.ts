import { IsString, IsNotEmpty, IsInt, Min } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class AddLineaParadaDto {
  @ApiProperty({ description: "ID de la parada a asignar a la línea" })
  @IsString()
  @IsNotEmpty()
  idParada!: string;

  @ApiProperty({
    description: "Posición de la parada en la secuencia (>0, única por línea)",
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  orden!: number;

  @ApiProperty({
    description: "Minutos hasta la siguiente parada (>=0)",
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  minutosHastaSiguiente!: number;
}
