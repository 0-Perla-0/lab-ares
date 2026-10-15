import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DomainTransaction } from "../common/domain/domain-transaction";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { InventoryCheckWorker } from "./inventory-check.worker";
@Module({
  imports: [AuthModule],
  controllers: [InventoryController],
  providers: [InventoryService, DomainTransaction, InventoryCheckWorker],
})
export class InventoryModule {}
