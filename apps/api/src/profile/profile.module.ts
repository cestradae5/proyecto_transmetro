import { Module } from "@nestjs/common";

import { AuthenticationModule } from "../authentication/authentication.module.js";
import { ProfileController } from "./profile.controller.js";
import { ProfileService } from "./profile.service.js";

@Module({
  imports: [AuthenticationModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
