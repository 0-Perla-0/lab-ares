import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CalendarModule } from "../calendar/calendar.module";
import { StorageModule } from "../storage/storage.module";
import { AbsencesController } from "./absences.controller";
import { AbsencesRepository } from "./absences.repository";
import { AbsencesService } from "./absences.service";
import { AbsenceEvaluationWorker } from "./absence-evaluation.worker";
@Module({
  imports: [AuthModule, CalendarModule, StorageModule],
  controllers: [AbsencesController],
  providers: [AbsencesService, AbsencesRepository, AbsenceEvaluationWorker],
})
export class AbsencesModule {}
