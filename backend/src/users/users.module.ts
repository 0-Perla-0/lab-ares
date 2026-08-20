import { Module } from "@nestjs/common";

import { OrganizationModule } from "../organization/organization.module";
import { UsersController } from "./users.controller";
import { UsersPolicy } from "./users.policy";
import { UsersRepository } from "./users.repository";
import { UsersService } from "./users.service";

@Module({
  imports: [OrganizationModule],
  controllers: [UsersController],
  providers: [UsersRepository, UsersService, UsersPolicy],
})
export class UsersModule {}
