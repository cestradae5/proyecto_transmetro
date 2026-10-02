import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";

import { AuthenticationGuard } from "../authentication/authentication.guard.js";
import { Permissions } from "../authentication/permissions.decorator.js";
import { CreateEmployeeDto } from "./dto/create-employee.dto.js";
import { EmployeeResponseDto } from "./dto/employee-response.dto.js";
import { QueryEmployeesDto } from "./dto/query-employees.dto.js";
import { UpdateEmployeeDto } from "./dto/update-employee.dto.js";
import { PersonalService } from "./personal.service.js";

// Permission literal matches the DB seed value (database/init.sql, tbl_permiso).
const EMPLEADOS_PERFILES_ADMINISTRAR = "EMPLEADOS_PERFILES_ADMINISTRAR";

@ApiTags("Personal")
@ApiBearerAuth()
@UseGuards(AuthenticationGuard)
@Controller("personal/empleados")
export class PersonalController {
  constructor(private readonly personalService: PersonalService) {}

  @Post()
  @Permissions(EMPLEADOS_PERFILES_ADMINISTRAR)
  @ApiOperation({ summary: "Create an employee" })
  @ApiResponse({ status: 201, description: "Employee created", type: EmployeeResponseDto })
  @ApiResponse({ status: 400, description: "Invalid payload, or role missing/inactive" })
  @ApiResponse({ status: 403, description: "Missing EMPLEADOS_PERFILES_ADMINISTRAR permission" })
  @ApiResponse({ status: 409, description: "Email or DPI already in use" })
  create(@Body() dto: CreateEmployeeDto): Promise<EmployeeResponseDto> {
    return this.personalService.create(dto);
  }

  @Get()
  @Permissions(EMPLEADOS_PERFILES_ADMINISTRAR)
  @ApiOperation({ summary: "List employees (optional search, status and role filters)" })
  @ApiResponse({ status: 200, description: "Employees found", type: [EmployeeResponseDto] })
  @ApiResponse({ status: 400, description: "Invalid query parameters" })
  @ApiResponse({ status: 403, description: "Missing EMPLEADOS_PERFILES_ADMINISTRAR permission" })
  findAll(@Query() query: QueryEmployeesDto): Promise<EmployeeResponseDto[]> {
    return this.personalService.findAll(query);
  }

  @Get(":id")
  @Permissions(EMPLEADOS_PERFILES_ADMINISTRAR)
  @ApiOperation({ summary: "Get an employee by id" })
  @ApiResponse({ status: 200, description: "Employee found", type: EmployeeResponseDto })
  @ApiResponse({ status: 403, description: "Missing EMPLEADOS_PERFILES_ADMINISTRAR permission" })
  @ApiResponse({ status: 404, description: "Employee not found" })
  findOne(@Param("id") id: string): Promise<EmployeeResponseDto> {
    return this.personalService.findOne(id);
  }

  @Patch(":id")
  @Permissions(EMPLEADOS_PERFILES_ADMINISTRAR)
  @ApiOperation({ summary: "Update an employee (also used to activate or deactivate)" })
  @ApiResponse({ status: 200, description: "Employee updated", type: EmployeeResponseDto })
  @ApiResponse({ status: 400, description: "Invalid payload, or role missing/inactive" })
  @ApiResponse({ status: 403, description: "Missing EMPLEADOS_PERFILES_ADMINISTRAR permission" })
  @ApiResponse({ status: 404, description: "Employee not found" })
  @ApiResponse({ status: 409, description: "Email or DPI already in use" })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateEmployeeDto,
  ): Promise<EmployeeResponseDto> {
    return this.personalService.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions(EMPLEADOS_PERFILES_ADMINISTRAR)
  @ApiOperation({ summary: "Permanently delete an employee" })
  @ApiResponse({ status: 204, description: "Employee deleted" })
  @ApiResponse({ status: 403, description: "Missing EMPLEADOS_PERFILES_ADMINISTRAR permission" })
  @ApiResponse({ status: 404, description: "Employee not found" })
  @ApiResponse({
    status: 409,
    description: "Employee is the caller or has history; deactivate instead",
  })
  remove(@Param("id") id: string, @Req() request: Request): Promise<void> {
    const actorEmployeeId = request.user?.employeeId;
    if (!actorEmployeeId) {
      // AuthenticationGuard always sets request.user; this only guards misuse.
      throw new UnauthorizedException();
    }
    return this.personalService.remove(id, actorEmployeeId);
  }
}
