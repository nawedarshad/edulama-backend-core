import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { SchoolSettingsService } from './school-settings/school-settings.service';
import { SchoolSettingsController } from './school-settings/school-settings.controller';
import { TimeSlotService } from './time-slot/time-slot.service';
import { TimeSlotController } from './time-slot/time-slot.controller';

import { NotificationService } from './notification/notification.service';
import { NotificationController } from './notification/notification.controller';

@Module({
    imports: [HttpModule, ConfigModule],
    controllers: [SchoolSettingsController, TimeSlotController, NotificationController],
    providers: [SchoolSettingsService, TimeSlotService, NotificationService],
    exports: [SchoolSettingsService, TimeSlotService, NotificationService], // Export if needed elsewhere
})
export class GlobalModule { }
