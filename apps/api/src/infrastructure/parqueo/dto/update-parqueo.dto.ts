import { PartialType } from "@nestjs/swagger";
import { CreateParqueoDto } from "./create-parqueo.dto.js";

export class UpdateParqueoDto extends PartialType(CreateParqueoDto) {}
