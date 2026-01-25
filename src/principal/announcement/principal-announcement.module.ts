import { Module } from '@nestjs/common';
import { PrincipalAnnouncementService } from './principal-announcement.service';
import { PrincipalAnnouncementController } from './principal-announcement.controller';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { NotificationModule } from '../global/notification/notification.module';

@Module({
    imports: [HttpModule, ConfigModule, NotificationModule],
    controllers: [PrincipalAnnouncementController],
    providers: [PrincipalAnnouncementService],
})
export class PrincipalAnnouncementModule { }
