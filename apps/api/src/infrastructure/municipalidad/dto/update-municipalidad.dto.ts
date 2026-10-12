import { PartialType } from "@nestjs/swagger";
import { CreateMunicipalidadDto } from "./create-municipalidad.dto.js";

export class UpdateMunicipalidadDto extends PartialType(CreateMunicipalidadDto) {}
