import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { InvitationsController } from "./invitations.controller";
import { InvitationsService } from "./invitations.service";
import { UsersModule } from "../users/users.module";
@Module({ imports: [AuthModule, UsersModule], controllers: [InvitationsController], providers: [InvitationsService] })
export class InvitationsModule {}
