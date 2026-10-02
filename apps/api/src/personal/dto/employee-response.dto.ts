import { ApiProperty } from "@nestjs/swagger";

import {
  EMPLOYEE_STATUSES,
  type EmployeeStatus,
} from "../../authentication/entities/employee.entity.js";

export class EmployeeResponseDto {
  @ApiProperty({ example: "1" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: Object.values(EMPLOYEE_STATUSES) })
  status!: EmployeeStatus;

  @ApiProperty({ example: "2" })
  roleId!: string;

  @ApiProperty({ example: "PILOTO" })
  roleCode!: string;

  @ApiProperty()
  roleName!: string;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty({ type: String, nullable: true })
  dpi!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "YYYY-MM-DD" })
  hireDate!: string | null;

  @ApiProperty({ type: String, nullable: true })
  address!: string | null;

  @ApiProperty({ type: String, nullable: true })
  licenseNumber!: string | null;

  @ApiProperty({ type: String, nullable: true })
  educationHistory!: string | null;

  @ApiProperty({ type: String, nullable: true })
  languages!: string | null;
}
