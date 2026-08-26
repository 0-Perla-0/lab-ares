import { Module } from "@nestjs/common";

import { ServerClock } from "../common/time/server-clock";
import { AttendanceController } from "./attendance.controller";
import { AttendanceRepository } from "./attendance.repository";
import { AttendanceRiskPolicy } from "./attendance-risk.policy";
import { AttendanceService } from "./attendance.service";

@Module({
  controllers: [AttendanceController],
  providers: [
    AttendanceRepository,
    AttendanceRiskPolicy,
    AttendanceService,
    ServerClock,
  ],
  exports: [AttendanceRepository, AttendanceService],
})
export class AttendanceModule {}
