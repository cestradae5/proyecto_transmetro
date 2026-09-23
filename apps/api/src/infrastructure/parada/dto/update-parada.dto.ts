import { PartialType } from "@nestjs/swagger";

import { CreateParadaDto } from "./create-parada.dto.js";

export class UpdateParadaDto extends PartialType(CreateParadaDto) {}
