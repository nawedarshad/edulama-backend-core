import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ParentTimetableController } from './parent-timetable.controller';
import { ParentTimetableService } from './parent-timetable.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { CalendarModule } from '../../principal/calendar/calendar.module';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule, CalendarModule],
    controllers: [ParentTimetableController],
    providers: [ParentTimetableService],
    exports: [ParentTimetableService],
})
export class ParentTimetableModule { }
