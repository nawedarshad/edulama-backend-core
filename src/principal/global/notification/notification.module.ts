import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { NotificationGateway } from './notification.gateway';
import { PrismaService } from '../../../prisma/prisma.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { DeliveryProcessor } from './delivery.processor';
import { DebugNotificationController } from './debug-notification.controller';
import { NotificationResponseController } from './notification-response.controller';

@Module({
    imports: [
        HttpModule,
        ConfigModule,
        BullModule.registerQueue({
            name: 'notification-delivery',
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: 'exponential', delay: 2000 },
                removeOnComplete: { count: 200 },
                removeOnFail: { count: 1000 },
            },
        })
    ],
    controllers: [NotificationController, DebugNotificationController, NotificationResponseController],
    providers: [NotificationService, NotificationGateway, PrismaService, DeliveryProcessor],
    exports: [NotificationService, NotificationGateway]
})
export class NotificationModule { }
