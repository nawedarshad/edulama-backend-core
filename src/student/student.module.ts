import { Module } from '@nestjs/common';
import { StudentTimetableModule } from './timetable/student-timetable.module';
import { StudentNoticeModule } from './notice/student-notice.module';
import { CalendarModule } from 'src/principal/calendar/calendar.module';
import { StudentCalendarController } from './calendar/student-calendar.controller';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [
        StudentTimetableModule,
        StudentNoticeModule,
        CalendarModule,
        HttpModule,
        ConfigModule,
    ],
    controllers: [StudentCalendarController],
})
export class StudentModule { }
