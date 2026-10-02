import { PartialType } from "@nestjs/swagger";

import { CreateEmployeeDto } from "./create-employee.dto.js";

// Every field is optional on update, but `dpi` keeps its Matches rule when
// present, so it can be omitted yet never cleared or set to an invalid value.
export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {}
