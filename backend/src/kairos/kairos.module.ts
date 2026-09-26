import { Module } from "@nestjs/common";
import { KairosController } from "./kairos.controller";
import { KairosService } from "./kairos.service";
import { KairosActivitiesController } from "./activities.controller";
import { KairosActivitiesService } from "./activities.service";
import { KairosKanbanController } from "./kanban.controller";
import { KairosKanbanService } from "./kanban.service";
import { AuthModule } from "../auth/auth.module";
import { StorageModule } from "../storage/storage.module";
@Module({ imports:[AuthModule,StorageModule], controllers: [KairosController,KairosActivitiesController,KairosKanbanController], providers: [KairosService,KairosActivitiesService,KairosKanbanService] })
export class KairosModule {}
