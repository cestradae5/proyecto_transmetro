import { Controller, Get, Req, UseFilters, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { AuthenticationGuard } from "../authentication/authentication.guard.js";
import { Permissions } from "../authentication/permissions.decorator.js";
import { DomainExceptionFilter } from "../shared/errors/domain-exception.filter.js";
import type { ProfileResponseDto } from "./dto/profile-response.dto.js";
import { ProfileService } from "./profile.service.js";

const PERFIL_PROPIO_CONSULTAR = "PERFIL_PROPIO_CONSULTAR";

@ApiTags("Perfil")
@Controller("profile")
@UseGuards(AuthenticationGuard)
@UseFilters(DomainExceptionFilter)
@ApiBearerAuth()
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @Permissions(PERFIL_PROPIO_CONSULTAR)
  @ApiOperation({
    summary: "Consultar el perfil propio: nombre, correo, rol y estación o línea asignada",
  })
  @ApiResponse({ status: 200, description: "Perfil del empleado autenticado" })
  @ApiResponse({ status: 404, description: "El empleado no existe" })
  getProfile(@Req() request: Record<string, any>): Promise<ProfileResponseDto> {
    return this.profileService.getProfile(request.user.employeeId);
  }
}
