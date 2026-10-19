// HTTP surface of the demo role switch (academic review only).
// GET  authentication/demo/personas -> roles the reviewer can act as
// POST authentication/demo/switch   -> { roleCode } -> new JWT as that persona
// POST authentication/demo/restore  -> new JWT for the reviewer's own account
// Responds 404 while the feature is disabled so it stays invisible.

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import {
  DemoPersonaNotFound,
  DemoRoleSwitchDisabled,
  DemoRoleSwitchForbidden,
  type DemoPersonasResult,
  type LoginResult,
} from "./authentication.contracts.js";
import { AuthenticationGuard } from "./authentication.guard.js";
import { DemoRoleSwitchService } from "./demo-role-switch.service.js";

@ApiTags("Autenticación - Cambio de rol (demo)")
@Controller("authentication/demo")
@UseGuards(AuthenticationGuard)
@ApiBearerAuth()
export class DemoRoleSwitchController {
  constructor(private readonly demoRoleSwitchService: DemoRoleSwitchService) {}

  @Get("personas")
  @ApiOperation({ summary: "List the roles an allowlisted reviewer can switch to" })
  @ApiResponse({ status: 403, description: "Account is not allowlisted" })
  @ApiResponse({ status: 404, description: "Demo role switch is disabled" })
  personas(@Req() request: Record<string, any>): Promise<DemoPersonasResult> {
    return mapErrors(() => this.demoRoleSwitchService.listPersonas(request.user));
  }

  @Post("switch")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Act as the representative employee of a role" })
  @ApiResponse({ status: 404, description: "Disabled, or no eligible persona for the role" })
  switch(
    @Req() request: Record<string, any>,
    @Body() body: { roleCode?: unknown },
  ): Promise<LoginResult> {
    const roleCode = typeof body?.roleCode === "string" ? body.roleCode : "";
    return mapErrors(() => this.demoRoleSwitchService.switchTo(request.user, roleCode));
  }

  @Post("restore")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Return to the reviewer's own account" })
  restore(@Req() request: Record<string, any>): Promise<LoginResult> {
    return mapErrors(() => this.demoRoleSwitchService.restore(request.user));
  }
}

async function mapErrors<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error: unknown) {
    if (error instanceof DemoRoleSwitchDisabled) throw new NotFoundException();
    if (error instanceof DemoRoleSwitchForbidden) throw new ForbiddenException();
    if (error instanceof DemoPersonaNotFound) throw new NotFoundException(error.message);
    throw error;
  }
}
