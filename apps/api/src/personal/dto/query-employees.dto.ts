import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsIn, IsNumberString, IsOptional, IsString, MaxLength } from "class-validator";

import type { EmployeeStatus } from "../../authentication/entities/employee.entity.js";
import { EMPLOYEE_STATUS_VALUES } from "./create-employee.dto.js";

export class QueryEmployeesDto {
  @ApiPropertyOptional({ description: "Case-insensitive match on name, email or DPI" })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MaxLength(254)
  search?: string;

  @ApiPropertyOptional({ enum: EMPLOYEE_STATUS_VALUES })
  @IsOptional()
  @IsIn(EMPLOYEE_STATUS_VALUES)
  status?: EmployeeStatus;

  @ApiPropertyOptional({ description: "Role id (bigint as string)", example: "2" })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  roleId?: string;
}
