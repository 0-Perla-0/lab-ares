import { Module } from "@nestjs/common";
import { AttendanceController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";
import { AttendancePolicy } from "./attendance.policy";

@Module({
  controllers: [AttendanceController],
  providers: [AttendanceService, AttendancePolicy],
})
export class AttendanceModule {}
