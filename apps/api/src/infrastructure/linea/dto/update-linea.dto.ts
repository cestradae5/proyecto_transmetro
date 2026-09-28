import { PartialType } from "@nestjs/swagger";
import { CreateLineaDto } from "./create-linea.dto.js";

export class UpdateLineaDto extends PartialType(CreateLineaDto) {}
