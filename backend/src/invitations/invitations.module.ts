import { Module } from "@nestjs/common";
import { DomainTransaction } from "../common/domain/domain-transaction";
import { AuthModule } from "../auth/auth.module";
import { InvitationsController } from "./invitations.controller";
import { InvitationsService } from "./invitations.service";
import { UsersModule } from "../users/users.module";
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [InvitationsController],
  providers: [InvitationsService, DomainTransaction],
})
export class InvitationsModule {}
