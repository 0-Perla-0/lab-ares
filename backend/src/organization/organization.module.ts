import { Module } from "@nestjs/common";

import { AreaController } from "./area.controller";
import { AreaRepository } from "./repositories/area.repository";
import { SedeRepository } from "./repositories/sede.repository";
import { TurnoRepository } from "./repositories/turno.repository";
import { AreaService } from "./services/area.service";
import { SedeService } from "./services/sede.service";
import { TurnoService } from "./services/turno.service";
import { SedeController } from "./sede.controller";
import { TurnoController } from "./turno.controller";

@Module({
  controllers: [SedeController, AreaController, TurnoController],
  providers: [
    SedeRepository,
    AreaRepository,
    TurnoRepository,
    SedeService,
    AreaService,
    TurnoService,
  ],
})
export class OrganizationModule {}
