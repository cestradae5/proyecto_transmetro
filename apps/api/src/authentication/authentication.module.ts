// Módulo de autenticación administrativa con Google.
// Registra el controller, el service y los repositorios como proveedores NestJS.
// El adaptador GoogleCredentialVerifier se inyecta (mockeable en tests).
// DataSource se provee externamente (DatabaseModule o mock en tests).

import { Module } from "@nestjs/common";
import { DataSource } from "typeorm";

import { AuthenticationController } from "./authentication.controller.js";
import { AuthenticationService } from "./authentication.service.js";
import { EmployeeRepository } from "./infrastructure/employee.repository.js";
import { SessionRepository } from "./infrastructure/session.repository.js";
import { AuditRepository } from "./infrastructure/audit.repository.js";
import { GoogleAuthLibraryAdapter } from "./infrastructure/google-auth-library.adapter.js";
import { GOOGLE_CREDENTIAL_VERIFIER, DATASOURCE } from "./infrastructure/google-credential-verifier.port.js";

@Module({
  controllers: [AuthenticationController],
  providers: [
    AuthenticationService,
    EmployeeRepository,
    SessionRepository,
    AuditRepository,
    {
      provide: DATASOURCE,
      useValue: null as unknown as DataSource,
    },
    {
      provide: GOOGLE_CREDENTIAL_VERIFIER,
      useClass: GoogleAuthLibraryAdapter,
    },
  ],
  exports: [AuthenticationService],
})
export class AuthenticationModule {}
