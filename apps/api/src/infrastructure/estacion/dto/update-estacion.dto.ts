import { PartialType } from "@nestjs/swagger";
import { CreateEstacionDto } from "./create-estacion.dto.js";

export class UpdateEstacionDto extends PartialType(CreateEstacionDto) {}
