import { Module } from '@nestjs/common';
import { TimetableController } from './timetable.controller';
import { TimetableService } from './timetable.service';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';
import { TimetableWorkflowController } from './timetable-workflow.controller';
import { TimetableWorkflowService } from './timetable-workflow.service';
import { TimetableExportController } from './timetable-export.controller';
import { TimetableExportService } from './timetable-export.service';

// Modular Services
import { TimetableAnalyticsService } from './services/analytics.service';
import { TimetableInventoryService } from './services/inventory.service';
import { TimetableCacheService } from './services/cache.service';
import { TimetablePeriodService } from './services/period.service';
import { TimetableEntryService } from './services/entry.service';
import { TimetableContextService } from './services/context.service';

import { PrismaModule } from 'src/prisma/prisma.module';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule],
    controllers: [TimetableController, ScheduleController, TimetableWorkflowController, TimetableExportController],
    providers: [
        TimetableService,
        ScheduleService,
        TimetableWorkflowService,
        TimetableExportService,
        TimetableAnalyticsService,
        TimetableInventoryService,
        TimetableCacheService,
        TimetablePeriodService,
        TimetableEntryService,
        TimetableContextService
    ],
    exports: [
        TimetableService,
        ScheduleService,
        TimetableWorkflowService,
        TimetableExportService,
        TimetableAnalyticsService,
        TimetableInventoryService,
        TimetableCacheService,
        TimetablePeriodService,
        TimetableEntryService,
        TimetableContextService
    ],
})
export class TimetableModule { }
