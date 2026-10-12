import { Module } from "@nestjs/common";

import { AuthenticationModule } from "../authentication/authentication.module.js";
import { AuditLogController } from "./audit-log.controller.js";
import { AuditLogService } from "./audit-log.service.js";

@Module({
  imports: [AuthenticationModule],
  controllers: [AuditLogController],
  providers: [AuditLogService],
})
export class AuditLogModule {}
