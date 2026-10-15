import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AbsenceTransaction } from "../absences/absence-transaction";
import { CalendarController } from "./calendar.controller";
import { CalendarService } from "./calendar.service";
@Module({
  imports: [AuthModule],
  controllers: [CalendarController],
  providers: [CalendarService, AbsenceTransaction],
  exports: [CalendarService, AbsenceTransaction],
})
export class CalendarModule {}
