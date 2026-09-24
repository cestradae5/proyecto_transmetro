import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthenticationModule } from "../authentication/authentication.module.js";

// Entities
import { ParadaEntity } from "./parada/parada.entity.js";
import { EstacionEntity } from "./estacion/estacion.entity.js";
import { ParqueoEntity } from "./parqueo/parqueo.entity.js";
import { LineaEntity } from "./linea/linea.entity.js";
import { LineaParadaEntity } from "./linea/linea-parada.entity.js";
import { AfectacionEntity } from "./afectacion/afectacion.entity.js";

// Controllers
import { ParadaController } from "./parada/parada.controller.js";
import { EstacionController } from "./estacion/estacion.controller.js";
import { ParqueoController } from "./parqueo/parqueo.controller.js";
import { LineaController } from "./linea/linea.controller.js";
import { AfectacionController } from "./afectacion/afectacion.controller.js";

// Services
import { ParadaService } from "./parada/parada.service.js";
import { EstacionService } from "./estacion/estacion.service.js";
import { ParqueoService } from "./parqueo/parqueo.service.js";
import { LineaService } from "./linea/linea.service.js";
import { AfectacionService } from "./afectacion/afectacion.service.js";

@Module({
  imports: [
    AuthenticationModule,
    TypeOrmModule.forFeature([
      ParadaEntity,
      EstacionEntity,
      ParqueoEntity,
      LineaEntity,
      LineaParadaEntity,
      AfectacionEntity,
    ]),
  ],
  controllers: [
    ParadaController,
    EstacionController,
    ParqueoController,
    LineaController,
    AfectacionController,
  ],
  providers: [
    ParadaService,
    EstacionService,
    ParqueoService,
    LineaService,
    AfectacionService,
  ],
  exports: [
    ParadaService,
    EstacionService,
    ParqueoService,
    LineaService,
    AfectacionService,
  ],
})
export class InfrastructureModule {}
