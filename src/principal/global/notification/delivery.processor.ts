import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationGateway } from './notification.gateway';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import * as admin from 'firebase-admin';
import { DeliveryStatus } from '@prisma/client';

@Injectable()
@Processor('notification-delivery', { concurrency: 5 })
export class DeliveryProcessor extends WorkerHost {
    private readonly logger = new Logger(DeliveryProcessor.name);
    private readonly expo = new Expo();

    constructor(
        private readonly prisma: PrismaService,
        private readonly gateway: NotificationGateway,
    ) {
        super();
    }

    async process(job: Job<any, any, string>): Promise<any> {
        const { notificationId, userConfigs, title, message, data } = job.data;
        this.logger.log(`Processing batch of ${userConfigs.length} users for notification ${notificationId}`);

        try {
            await this.executeDelivery(notificationId, userConfigs, title, message, data);
        } catch (error) {
            this.logger.error(`Critical failure in job ${job.id}`, error);
            throw error;
        }
    }

    private async executeDelivery(
        notificationId: string,
        configs: { token: string; userId: number }[],
        title: string,
        body: string,
        data: any,
    ) {
        const isEmergency = title.toUpperCase().includes('EMERGENCY') || title.toUpperCase().includes('URGENT');
        const displayTitle = isEmergency ? `🚨 ${title}` : `📢 Edulama: ${title}`;

        const expoConfigs = configs.filter(c => Expo.isExpoPushToken(c.token));
        const fcmConfigs = configs.filter(c => c.token && !Expo.isExpoPushToken(c.token));

        const successUserIds = new Set<number>();
        const failedUserIds = new Set<number>();
        const staleTokens: { userId: number; token: string }[] = [];

        // Run Expo and FCM in parallel
        await Promise.all([
            this.deliverViaExpo(expoConfigs, displayTitle, body, data, isEmergency, successUserIds, failedUserIds),
            this.deliverViaFCM(fcmConfigs, displayTitle, body, data, isEmergency, successUserIds, failedUserIds, staleTokens),
        ]);

        // Batch DB status updates + stale token cleanup in parallel
        await Promise.all([
            successUserIds.size > 0
                ? this.prisma.notificationDelivery.updateMany({
                    where: {
                        notificationId: BigInt(notificationId),
                        userId: { in: Array.from(successUserIds) },
                    },
                    data: { status: DeliveryStatus.SENT, deliveredAt: new Date() },
                })
                : Promise.resolve(),
            failedUserIds.size > 0
                ? this.prisma.notificationDelivery.updateMany({
                    where: {
                        notificationId: BigInt(notificationId),
                        userId: { in: Array.from(failedUserIds) },
                    },
                    data: { status: DeliveryStatus.FAILED, lastError: 'Push delivery failed' },
                })
                : Promise.resolve(),
            this.batchCleanupStaleTokens(staleTokens),
        ]);

        // Fire-and-forget WebSocket delivery (real-time in-app fallback)
        for (const c of configs) {
            this.gateway.sendToUser(c.userId, 'notification', {
                title,
                message: body,
                data,
                createdAt: new Date(),
            });
        }
    }

    private async deliverViaExpo(
        configs: { token: string; userId: number }[],
        displayTitle: string,
        body: string,
        data: any,
        isEmergency: boolean,
        successUserIds: Set<number>,
        failedUserIds: Set<number>,
    ) {
        if (configs.length === 0) return;

        const messages: ExpoPushMessage[] = configs.map(c => ({
            to: c.token,
            sound: 'default' as const,
            title: displayTitle,
            body,
            data,
            priority: isEmergency ? ('high' as const) : ('default' as const),
            channelId: isEmergency ? 'emergency-alerts' : 'default',
        }));

        const chunks = this.expo.chunkPushNotifications(messages);
        let offset = 0;

        for (const chunk of chunks) {
            try {
                const tickets = await this.expo.sendPushNotificationsAsync(chunk);
                tickets.forEach((ticket, idx) => {
                    const config = configs[offset + idx];
                    if (ticket.status === 'ok') {
                        successUserIds.add(config.userId);
                    } else {
                        failedUserIds.add(config.userId);
                        this.logger.warn(`Expo failed for user ${config.userId}: ${(ticket as any).message}`);
                    }
                });
            } catch (error) {
                this.logger.error('Expo chunk delivery error', error);
                for (let i = 0; i < chunk.length; i++) {
                    failedUserIds.add(configs[offset + i].userId);
                }
            }
            offset += chunk.length;
        }
    }

    private async deliverViaFCM(
        configs: { token: string; userId: number }[],
        displayTitle: string,
        body: string,
        data: any,
        isEmergency: boolean,
        successUserIds: Set<number>,
        failedUserIds: Set<number>,
        staleTokens: { userId: number; token: string }[],
    ) {
        if (configs.length === 0 || admin.apps.length === 0) return;

        // FCM requires all data values to be strings; skip null/undefined
        const stringifiedData = Object.entries(data || {}).reduce((acc, [key, val]) => {
            if (val !== null && val !== undefined) acc[key] = String(val);
            return acc;
        }, {} as Record<string, string>);

        const FCM_CHUNK_SIZE = 500;
        for (let i = 0; i < configs.length; i += FCM_CHUNK_SIZE) {
            const chunk = configs.slice(i, i + FCM_CHUNK_SIZE);
            try {
                const response = await admin.messaging().sendEachForMulticast({
                    tokens: chunk.map(c => c.token),
                    data: {
                        title: displayTitle,
                        body,
                        isEmergency: isEmergency ? 'true' : 'false',
                        ...stringifiedData,
                    },
                    android: { priority: 'high' },
                });

                response.responses.forEach((resp, idx) => {
                    const config = chunk[idx];
                    if (resp.success) {
                        successUserIds.add(config.userId);
                    } else {
                        const code = resp.error?.code;
                        if (
                            code === 'messaging/registration-token-not-registered' ||
                            code === 'messaging/invalid-registration-token'
                        ) {
                            staleTokens.push({ userId: config.userId, token: config.token });
                        }
                        failedUserIds.add(config.userId);
                    }
                });
            } catch (error) {
                this.logger.error(`FCM multicast error for chunk [${i}–${i + chunk.length}]`, error);
                chunk.forEach(c => failedUserIds.add(c.userId));
            }
        }
    }

    private async batchCleanupStaleTokens(cleanups: { userId: number; token: string }[]) {
        if (cleanups.length === 0) return;

        const byUser = new Map<number, Set<string>>();
        for (const { userId, token } of cleanups) {
            if (!byUser.has(userId)) byUser.set(userId, new Set());
            byUser.get(userId)!.add(token);
        }

        const users = await this.prisma.user.findMany({
            where: { id: { in: Array.from(byUser.keys()) } },
            select: { id: true, deviceTokens: true },
        });

        await Promise.all(
            users.map(user => {
                const stale = byUser.get(user.id) ?? new Set<string>();
                const tokens = (user.deviceTokens as Record<string, string>) || {};
                const cleaned: Record<string, string> = {};
                for (const [key, value] of Object.entries(tokens)) {
                    if (!stale.has(value)) cleaned[key] = value;
                }
                if (Object.keys(cleaned).length === Object.keys(tokens).length) {
                    return Promise.resolve(); // nothing removed
                }
                return this.prisma.user.update({
                    where: { id: user.id },
                    data: { deviceTokens: cleaned },
                });
            }),
        );

        this.logger.warn(`[StaleTokenCleanup] Processed ${cleanups.length} stale token(s) across ${byUser.size} user(s)`);
    }
}
