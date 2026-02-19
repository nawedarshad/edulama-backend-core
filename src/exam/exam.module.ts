import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { ExamController } from './exam.controller';
import { ExamService } from './exam.service';
import { ExamScheduleService } from './exam-schedule.service';
import { SeatingService } from './seating.service';
import { InvigilatorService } from './invigilator.service';
import { QuestionPaperService } from './question-paper.service';
import { ResultService } from './result.service';
import { AdmitCardService } from './admit-card.service';
import { ReportCardService } from './report-card.service';
import { ExamAttendanceService } from './exam-attendance.service';

import { ExamStudentController } from './exam-student.controller';
import { ExamTeacherController } from './exam-teacher.controller';

import { CalendarModule } from '../principal/calendar/calendar.module';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule, CalendarModule],
    controllers: [ExamController, ExamStudentController, ExamTeacherController],
    providers: [
        ExamService,
        ExamScheduleService,
        SeatingService,
        InvigilatorService,
        QuestionPaperService,
        ResultService,
        AdmitCardService,
        ReportCardService,
        ExamAttendanceService,
    ],
    exports: [
        ExamService,
        ExamScheduleService,
        SeatingService,
        InvigilatorService,
        QuestionPaperService,
        ResultService,
        AdmitCardService,
        ReportCardService,
        ExamAttendanceService,
    ],
})
export class ExamModule { }
