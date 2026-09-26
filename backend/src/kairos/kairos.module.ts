import { Module } from "@nestjs/common";
import { KairosController } from "./kairos.controller";
import { KairosService } from "./kairos.service";
@Module({ controllers: [KairosController], providers: [KairosService] })
export class KairosModule {}
