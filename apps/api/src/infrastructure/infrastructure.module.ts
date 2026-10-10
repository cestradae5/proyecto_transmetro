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
import { EstacionLineaEntity } from "./estacion/estacion-linea.entity.js";
import { MunicipalidadEntity } from "./municipalidad/municipalidad.entity.js";
import { LineaMunicipalidadEntity } from "./municipalidad/linea-municipalidad.entity.js";
import { AccesoEntity } from "./acceso/acceso.entity.js";

// Controllers
import { ParadaController } from "./parada/parada.controller.js";
import { EstacionController } from "./estacion/estacion.controller.js";
import { ParqueoController } from "./parqueo/parqueo.controller.js";
import { LineaController } from "./linea/linea.controller.js";
import { AfectacionController } from "./afectacion/afectacion.controller.js";
import { EstacionLineaController } from "./estacion/estacion-linea.controller.js";
import { MunicipalidadController } from "./municipalidad/municipalidad.controller.js";
import { LineaMunicipalidadController } from "./municipalidad/linea-municipalidad.controller.js";
import { AccesoController } from "./acceso/acceso.controller.js";

// Services
import { ParadaService } from "./parada/parada.service.js";
import { EstacionService } from "./estacion/estacion.service.js";
import { ParqueoService } from "./parqueo/parqueo.service.js";
import { LineaService } from "./linea/linea.service.js";
import { AfectacionService } from "./afectacion/afectacion.service.js";
import { EstacionLineaService } from "./estacion/estacion-linea.service.js";
import { MunicipalidadService } from "./municipalidad/municipalidad.service.js";
import { LineaMunicipalidadService } from "./municipalidad/linea-municipalidad.service.js";
import { AccesoService } from "./acceso/acceso.service.js";

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
      EstacionLineaEntity,
      MunicipalidadEntity,
      LineaMunicipalidadEntity,
      AccesoEntity,
    ]),
  ],
  controllers: [
    ParadaController,
    EstacionController,
    ParqueoController,
    LineaController,
    AfectacionController,
    EstacionLineaController,
    MunicipalidadController,
    LineaMunicipalidadController,
    AccesoController,
  ],
  providers: [
    ParadaService,
    EstacionService,
    ParqueoService,
    LineaService,
    AfectacionService,
    EstacionLineaService,
    MunicipalidadService,
    LineaMunicipalidadService,
    AccesoService,
  ],
  exports: [
    ParadaService,
    EstacionService,
    ParqueoService,
    LineaService,
    AfectacionService,
    MunicipalidadService,
  ],
})
export class InfrastructureModule {}
