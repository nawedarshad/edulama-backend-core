import { Module } from '@nestjs/common';
import { TimetableController } from './timetable.controller';
import { TimetableService } from './timetable.service';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';
import { TimetableWorkflowController } from './timetable-workflow.controller';
import { TimetableWorkflowService } from './timetable-workflow.service';
import { TimetableExportController } from './timetable-export.controller';
import { TimetableExportService } from './timetable-export.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule],
    controllers: [TimetableController, ScheduleController, TimetableWorkflowController, TimetableExportController],
    providers: [TimetableService, ScheduleService, TimetableWorkflowService, TimetableExportService],
    exports: [TimetableService, ScheduleService, TimetableWorkflowService, TimetableExportService],
})
export class TimetableModule { }
