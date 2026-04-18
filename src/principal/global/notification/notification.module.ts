import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { NotificationGateway } from './notification.gateway';
import { PrismaService } from '../../../prisma/prisma.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { DebugNotificationController } from './debug-notification.controller';

@Module({
    imports: [HttpModule, ConfigModule],
    controllers: [NotificationController, DebugNotificationController],
    providers: [NotificationService, NotificationGateway, PrismaService],
    exports: [NotificationService, NotificationGateway]
})
export class NotificationModule { }
