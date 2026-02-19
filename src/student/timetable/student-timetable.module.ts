import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { StudentTimetableController } from './student-timetable.controller';
import { StudentTimetableService } from './student-timetable.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { CalendarModule } from '../../principal/calendar/calendar.module';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule, CalendarModule],
    controllers: [StudentTimetableController],
    providers: [StudentTimetableService],
    exports: [StudentTimetableService],
})
export class StudentTimetableModule { }
