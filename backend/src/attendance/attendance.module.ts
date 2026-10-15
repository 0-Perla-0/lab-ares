import { Module } from "@nestjs/common";
import { AttendanceController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";
import { AttendancePolicy } from "./attendance.policy";
import { AuthModule } from "../auth/auth.module";
import { AttendanceReviewController } from "./attendance-review.controller";
import { AttendanceReviewService } from "./attendance-review.service";
import { AttendanceWorker } from "./attendance.worker";
import { CalendarModule } from "../calendar/calendar.module";

@Module({
  imports: [AuthModule, CalendarModule],
  controllers: [AttendanceController, AttendanceReviewController],
  providers: [
    AttendanceService,
    AttendancePolicy,
    AttendanceReviewService,
    AttendanceWorker,
  ],
})
export class AttendanceModule {}
