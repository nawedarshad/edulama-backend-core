import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { SchoolSettingsService } from './school-settings/school-settings.service';
import { SchoolSettingsController } from './school-settings/school-settings.controller';
import { TimeSlotService } from './time-slot/time-slot.service';
import { TimeSlotController } from './time-slot/time-slot.controller';
import { NotificationModule } from './notification/notification.module';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
    imports: [HttpModule, ConfigModule, NotificationModule],
    controllers: [SchoolSettingsController, TimeSlotController],
    providers: [SchoolSettingsService, TimeSlotService, PrismaService],
    exports: [SchoolSettingsService, TimeSlotService, NotificationModule], // Export if needed elsewhere
})
export class GlobalModule { }
