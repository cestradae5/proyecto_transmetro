import { PartialType } from "@nestjs/swagger";
import { CreateAfectacionDto } from "./create-afectacion.dto.js";

export class UpdateAfectacionDto extends PartialType(CreateAfectacionDto) {}
