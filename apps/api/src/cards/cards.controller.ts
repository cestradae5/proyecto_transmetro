import { Controller, Get, Param, Query, UseFilters, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { AuthenticationGuard } from "../authentication/authentication.guard.js";
import { Permissions } from "../authentication/permissions.decorator.js";
import { DomainExceptionFilter } from "../shared/errors/domain-exception.filter.js";
import { CardsService } from "./cards.service.js";
import { QueryCardsDto, type CardActivityDto, type CardPageDto } from "./dto/cards.dto.js";

// Permission literal matches the DB seed value (database/init.sql, tbl_permiso).
const RECARGAS_REPORTES_CONSULTAR = "RECARGAS_REPORTES_CONSULTAR";

// Staff, read-only view of citizen cards (odd/tasks/card-activity.md). The
// public, unauthenticated card routes live under /citizen.
@ApiTags("Tarjetas")
@Controller("cards")
@UseGuards(AuthenticationGuard)
@UseFilters(DomainExceptionFilter)
@ApiBearerAuth()
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Get()
  @Permissions(RECARGAS_REPORTES_CONSULTAR)
  @ApiOperation({ summary: "Tarjetas por número, 20 por página, con búsqueda parcial" })
  @ApiResponse({ status: 400, description: "Búsqueda o página inválida" })
  list(@Query() query: QueryCardsDto): Promise<CardPageDto> {
    return this.cardsService.list(query);
  }

  @Get(":numeroTarjeta/activity")
  @Permissions(RECARGAS_REPORTES_CONSULTAR)
  @ApiOperation({ summary: "Pasadas por talanquera y recargas de una tarjeta, más recientes primero" })
  @ApiResponse({ status: 404, description: "La tarjeta no existe" })
  activity(@Param("numeroTarjeta") numeroTarjeta: string): Promise<CardActivityDto> {
    return this.cardsService.activity(numeroTarjeta);
  }
}
