// Módulo de autenticación administrativa con Google.
// Registra el controller, el service y los repositorios como proveedores NestJS.
// El adaptador GoogleCredentialVerifier se inyecta (mockeable en tests).
// DataSource se provee externamente (DatabaseModule o mock en tests).

import { Module } from "@nestjs/common";
import { DataSource } from "typeorm";

import { AuthenticationController } from "./authentication.controller.js";
import { AuthenticationService } from "./authentication.service.js";
import { AuthenticationGuard } from "./authentication.guard.js";
import { EmployeeRepository } from "./infrastructure/employee.repository.js";
import { AuditRepository } from "./infrastructure/audit.repository.js";
import { AssignmentScopeRepository } from "./infrastructure/assignment-scope.repository.js";
import { GoogleAuthLibraryAdapter } from "./infrastructure/google-auth-library.adapter.js";
import { GOOGLE_CREDENTIAL_VERIFIER, DATASOURCE } from "./infrastructure/google-credential-verifier.port.js";

@Module({
  controllers: [AuthenticationController],
  providers: [
    AuthenticationService,
    AuthenticationGuard,
    EmployeeRepository,
    AuditRepository,
    AssignmentScopeRepository,
    {
      provide: DATASOURCE,
      useExisting: DataSource,
    },
    {
      provide: GOOGLE_CREDENTIAL_VERIFIER,
      useFactory: () => {
        const clientId = process.env.GOOGLE_WEB_CLIENT_ID;
        if (!clientId) {
          throw new Error("GOOGLE_WEB_CLIENT_ID is required in environment");
        }
        return new GoogleAuthLibraryAdapter(clientId);
      },
    },
  ],
  exports: [AuthenticationService, AuthenticationGuard, AuditRepository],
})
export class AuthenticationModule {}
