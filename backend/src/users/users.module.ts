import { Module } from "@nestjs/common";

import { DomainTransaction } from "../common/domain/domain-transaction";
import { OrganizationModule } from "../organization/organization.module";
import { UsersController } from "./users.controller";
import { UsersPolicy } from "./users.policy";
import { UsersRepository } from "./users.repository";
import { UsersService } from "./users.service";
import { AuthModule } from "../auth/auth.module";
import { AdministrativeRecoveryService } from "./administrative-recovery.service";

@Module({
  imports: [OrganizationModule, AuthModule],
  controllers: [UsersController],
  providers: [
    UsersRepository,
    UsersService,
    UsersPolicy,
    AdministrativeRecoveryService,
    DomainTransaction,
  ],
  exports: [UsersPolicy],
})
export class UsersModule {}
