import { Body, Controller, Get, Param, Post, Query, Res, UseFilters } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";

import { DomainExceptionFilter } from "../../shared/errors/domain-exception.filter.js";
import { CreatePaymentDto, type PaymentStartedDto, type PaymentStatusDto } from "../dto/citizen.dto.js";
import { QpayproPaymentsService, type RelayQuery } from "./qpaypro-payments.service.js";

// Public QPayPro checkout endpoints (odd/tasks/qpaypro-checkout.md S3-S6):
// no login, like the rest of /citizen.
@ApiTags("Ciudadano")
@Controller("citizen")
@UseFilters(DomainExceptionFilter)
export class QpayproPaymentsController {
  constructor(private readonly paymentsService: QpayproPaymentsService) {}

  @Post("cards/:numeroTarjeta/payments")
  @ApiOperation({ summary: "Inicia un pago con QPayPro y devuelve la URL de la página de pago" })
  @ApiResponse({ status: 201, description: "Transacción registrada en QPayPro" })
  @ApiResponse({ status: 400, description: "Monto o correo inválidos" })
  @ApiResponse({ status: 404, description: "La tarjeta no existe" })
  @ApiResponse({ status: 409, description: "Tarjeta no activa" })
  @ApiResponse({ status: 502, description: "QPayPro no entregó el token" })
  @ApiResponse({ status: 503, description: "Falta configuración de QPayPro" })
  start(@Param("numeroTarjeta") numeroTarjeta: string, @Body() dto: CreatePaymentDto): Promise<PaymentStartedDto> {
    return this.paymentsService.start(numeroTarjeta, dto);
  }

  // Raw query: a malformed relay must still redirect, never answer 400.
  @Get("payments/qpaypro/relay")
  @ApiOperation({ summary: "Retorno del navegador desde QPayPro; valida la firma y acredita el pago" })
  @ApiResponse({ status: 302, description: "Redirige a user-web con ?pago=<referencia> o ?pago=desconocido" })
  relay(@Query() query: RelayQuery, @Res() response: Response): Promise<void> {
    return this.paymentsService.relay(query).then((url) => response.redirect(302, url));
  }

  @Get("payments/qpaypro/cancel")
  @ApiOperation({ summary: "El pagador canceló en QPayPro: el pago INICIADA pasa a EXPIRADA" })
  @ApiQuery({ name: "referencia", required: true })
  @ApiResponse({ status: 302, description: "Redirige a user-web con ?pago=<referencia> o ?pago=desconocido" })
  cancel(@Query() query: RelayQuery, @Res() response: Response): Promise<void> {
    return this.paymentsService.cancel(query.referencia).then((url) => response.redirect(302, url));
  }

  @Get("payments/:referencia")
  @ApiOperation({ summary: "Estado de un pago con QPayPro y saldo actual de la tarjeta" })
  @ApiResponse({ status: 200, description: "Estado del pago" })
  @ApiResponse({ status: 404, description: "El pago no existe" })
  status(@Param("referencia") referencia: string): Promise<PaymentStatusDto> {
    return this.paymentsService.status(referencia);
  }
}
