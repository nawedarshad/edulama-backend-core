import { Module } from '@nestjs/common';
import { PrincipalAnnouncementService } from './principal-announcement.service';
import { PrincipalAnnouncementController } from './principal-announcement.controller';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { NotificationModule } from '../global/notification/notification.module';
import { BullModule } from '@nestjs/bullmq';
import { AnnouncementProcessor } from './announcement.processor';

@Module({
    imports: [
        HttpModule,
        ConfigModule,
        NotificationModule,
        BullModule.registerQueue({
            name: 'announcements',
        })
    ],
    controllers: [PrincipalAnnouncementController],
    providers: [PrincipalAnnouncementService, AnnouncementProcessor],
})
export class PrincipalAnnouncementModule { }
