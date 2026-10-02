import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

import {
  EMPLOYEE_STATUSES,
  type EmployeeStatus,
} from "../../authentication/entities/employee.entity.js";

export const EMPLOYEE_STATUS_VALUES = Object.values(EMPLOYEE_STATUSES);

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === "string" ? value.trim() : value;

const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === "string" ? value.trim().toLowerCase() : value;

export class CreateEmployeeDto {
  @ApiProperty({ example: "Maria Lopez", maxLength: 120 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: "maria.lopez@transmetro.gt", maxLength: 254 })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiPropertyOptional({
    enum: EMPLOYEE_STATUS_VALUES,
    default: EMPLOYEE_STATUSES.ACTIVE,
  })
  @IsOptional()
  @IsIn(EMPLOYEE_STATUS_VALUES)
  status?: EmployeeStatus;

  @ApiProperty({ description: "Role id (bigint as string)", example: "2" })
  @IsNumberString({ no_symbols: true })
  roleId!: string;

  @ApiProperty({ description: "Guatemalan DPI, exactly 13 digits", example: "2456789012301" })
  @Matches(/^\d{13}$/, { message: "dpi must be exactly 13 digits" })
  dpi!: string;

  @ApiPropertyOptional({ example: "+502 5555-1234", maxLength: 20 })
  @IsOptional()
  @Matches(/^[0-9+()\-\s]{7,20}$/, { message: "phone must be a valid phone number" })
  phone?: string;

  @ApiPropertyOptional({ description: "Hire date (YYYY-MM-DD)", example: "2024-03-15" })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "hireDate must be in YYYY-MM-DD format" })
  hireDate?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ description: "Driving licence number", maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  licenseNumber?: string;

  @ApiPropertyOptional({ description: "Free text education history", maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  educationHistory?: string;

  @ApiPropertyOptional({ description: "Free text spoken languages", maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  languages?: string;
}
