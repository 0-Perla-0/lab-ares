import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DomainTransaction } from "../common/domain/domain-transaction";
import { VisitsController } from "./visits.controller";
import { VisitsService } from "./visits.service";
@Module({
  imports: [AuthModule],
  controllers: [VisitsController],
  providers: [VisitsService, DomainTransaction],
})
export class VisitsModule {}
