import { PartialType } from "@nestjs/swagger";

import { CreateAccesoDto } from "./create-acceso.dto.js";

// An acceso cannot be moved to another parada: the body has no idParada.
export class UpdateAccesoDto extends PartialType(CreateAccesoDto) {}
