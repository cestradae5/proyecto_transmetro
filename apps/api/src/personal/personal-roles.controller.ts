import { Controller, Get, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";

import { AuthenticationGuard } from "../authentication/authentication.guard.js";
import { Permissions } from "../authentication/permissions.decorator.js";
import { RoleResponseDto } from "./dto/role-response.dto.js";
import { PersonalService } from "./personal.service.js";

// Permission literal matches the DB seed value (database/init.sql, tbl_permiso).
const EMPLEADOS_PERFILES_ADMINISTRAR = "EMPLEADOS_PERFILES_ADMINISTRAR";

// Separate controller so `personal/roles` can never be captured by the
// `personal/empleados/:id` route of PersonalController.
@ApiTags("Personal")
@ApiBearerAuth()
@UseGuards(AuthenticationGuard)
@Controller("personal/roles")
export class PersonalRolesController {
  constructor(private readonly personalService: PersonalService) {}

  @Get()
  @Permissions(EMPLEADOS_PERFILES_ADMINISTRAR)
  @ApiOperation({ summary: "List active roles (id, code, name) ordered by name" })
  @ApiResponse({ status: 200, description: "Active roles", type: [RoleResponseDto] })
  @ApiResponse({ status: 401, description: "Missing or invalid token" })
  @ApiResponse({ status: 403, description: "Missing EMPLEADOS_PERFILES_ADMINISTRAR permission" })
  findRoles(): Promise<RoleResponseDto[]> {
    return this.personalService.findRoles();
  }
}
