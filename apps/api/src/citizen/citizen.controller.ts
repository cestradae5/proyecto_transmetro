import { Body, Controller, Get, Param, Post, Res, UseFilters, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";

import { DomainExceptionFilter } from "../shared/errors/domain-exception.filter.js";
import { CitizenService } from "./citizen.service.js";
import {
  CreateRechargeDto,
  type CitizenCardDto,
  type CitizenStationDto,
  type RechargeResponseDto,
} from "./dto/citizen.dto.js";
import { RechargeSimulatorGuard } from "./recharge-simulator.guard.js";

// Public endpoints for apps/user-web: no login, the card number identifies
// the card (odd/tasks/user-web.md S2-S6).
@ApiTags("Ciudadano")
@Controller("citizen")
@UseFilters(DomainExceptionFilter)
export class CitizenController {
  constructor(private readonly citizenService: CitizenService) {}

  @Get("stations")
  @ApiOperation({ summary: "Estaciones activas, por nombre" })
  listStations(): Promise<CitizenStationDto[]> {
    return this.citizenService.listStations();
  }

  @Get("cards/:numeroTarjeta")
  @ApiOperation({ summary: "Saldo y estado de una tarjeta" })
  @ApiResponse({ status: 404, description: "La tarjeta no existe" })
  getCard(@Param("numeroTarjeta") numeroTarjeta: string): Promise<CitizenCardDto> {
    return this.citizenService.getCard(numeroTarjeta);
  }

  @Post("cards/:numeroTarjeta/recharges")
  @UseGuards(RechargeSimulatorGuard)
  @ApiOperation({ summary: "Recarga simulada (sin pago real)" })
  @ApiResponse({ status: 201, description: "Recarga aprobada" })
  @ApiResponse({ status: 200, description: "Reintento: devuelve la recarga original" })
  @ApiResponse({ status: 400, description: "Monto o referencia inválidos" })
  @ApiResponse({ status: 404, description: "Simulador apagado o tarjeta inexistente" })
  @ApiResponse({ status: 409, description: "Tarjeta no activa o referencia usada en otra recarga" })
  async recharge(
    @Param("numeroTarjeta") numeroTarjeta: string,
    @Body() dto: CreateRechargeDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RechargeResponseDto> {
    const result = await this.citizenService.recharge(numeroTarjeta, dto);
    response.status(result.repetida ? 200 : 201);
    return result;
  }
}
