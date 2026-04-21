import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { SchoolSettingsService } from './school-settings/school-settings.service';
import { SchoolSettingsController } from './school-settings/school-settings.controller';
import { TimeSlotService } from './time-slot/time-slot.service';
import { TimeSlotController } from './time-slot/time-slot.controller';
import { NavigationService } from './navigation/navigation.service';
import { NavigationController } from './navigation/navigation.controller';
import { WebPageModule } from './web-page/web-page.module';
import { NotificationModule } from './notification/notification.module';
import { PrismaService } from '../../prisma/prisma.service';
import { FileUploadModule } from '../../common/file-upload/file-upload.module';

@Module({
    imports: [HttpModule, ConfigModule, NotificationModule, WebPageModule, FileUploadModule],
    controllers: [SchoolSettingsController, TimeSlotController, NavigationController],
    providers: [SchoolSettingsService, TimeSlotService, NavigationService, PrismaService],
    exports: [SchoolSettingsService, TimeSlotService, NavigationService, WebPageModule, NotificationModule], // Export if needed elsewhere
})
export class GlobalModule { }
