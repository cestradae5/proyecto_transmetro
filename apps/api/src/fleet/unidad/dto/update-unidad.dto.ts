import { PartialType } from "@nestjs/swagger";

import { CreateUnidadDto } from "./create-unidad.dto.js";

// Matches UpdateParqueoDto/UpdateLineaDto exactly (design.md Decision 7).
// `estadoUnidad` is already optional + @IsEnum on CreateUnidadDto, so
// PartialType carries it through without redeclaration; this is also what
// enables state-transition PATCH requests (estadoUnidad-only payload).
export class UpdateUnidadDto extends PartialType(CreateUnidadDto) {}
