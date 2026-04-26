import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationType, DeliveryStatus } from '@prisma/client';
import { NotificationGateway } from './notification.gateway';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Expo } from 'expo-server-sdk';
import * as admin from 'firebase-admin';

@Injectable()
export class NotificationService {
    private readonly logger = new Logger(NotificationService.name);
    private expo = new Expo();

    constructor(
        private readonly prisma: PrismaService,
        private readonly gateway: NotificationGateway,
        @InjectQueue('notification-delivery') private readonly deliveryQueue: Queue
    ) {
        if (admin.apps.length === 0) {
            const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
            if (serviceAccountPath) {
                try {
                    admin.initializeApp({
                        credential: admin.credential.applicationDefault()
                    });
                    this.logger.log('Firebase Admin initialized successfully.');
                } catch (error) {
                    this.logger.error('Failed to initialize Firebase Admin:', error);
                }
            } else {
                this.logger.warn('GOOGLE_APPLICATION_CREDENTIALS not found. FCM notifications will be disabled.');
            }
        }
    }

    // Helper to process users in batches for the queue
    private async enqueueUserBatches(notificationId: bigint, users: any[], title: string, message: string, data: any) {
        if (users.length === 0) return;

        // 1. Bulk create deliveries in PENDING state
        await this.prisma.notificationDelivery.createMany({
            data: users.map((u: any) => ({
                notificationId,
                userId: u.id,
                status: DeliveryStatus.PENDING,
            })),
            skipDuplicates: true,
        });

        // 2. Users without push tokens will never receive a job — mark them SENT now
        //    so their delivery records don't stay PENDING forever (they see it in-app).
        const tokenlessUserIds = users
            .filter((u: any) => !u.deviceTokens || Object.keys((u.deviceTokens as object) || {}).length === 0)
            .map((u: any) => u.id);

        if (tokenlessUserIds.length > 0) {
            await this.prisma.notificationDelivery.updateMany({
                where: { notificationId, userId: { in: tokenlessUserIds } },
                data: { status: DeliveryStatus.SENT, deliveredAt: new Date() },
            });
        }

        // 3. Enqueue batches of 50 for push delivery
        const BATCH_SIZE = 50;
        const isEmergency = title.toUpperCase().includes('EMERGENCY') || title.toUpperCase().includes('URGENT');

        for (let i = 0; i < users.length; i += BATCH_SIZE) {
            const batchUsers = users.slice(i, i + BATCH_SIZE);
            const userConfigs = batchUsers.flatMap((u: any) => {
                const tokensMap = (u.deviceTokens as Record<string, string>) || {};
                return Object.values(tokensMap).map(token => ({ token, userId: u.id }));
            });

            if (userConfigs.length > 0) {
                await this.deliveryQueue.add('deliver', {
                    notificationId: notificationId.toString(),
                    userConfigs,
                    title,
                    message,
                    data,
                }, {
                    attempts: isEmergency ? 10 : 3,
                    backoff: { type: 'exponential', delay: 1000 },
                    priority: isEmergency ? 1 : 2,
                    removeOnComplete: true,
                });
            }
        }
    }

    async create(schoolId: number, creatorId: number, dto: CreateNotificationDto) {
        // 1. Create Notification Record
        const notification = await this.prisma.notification.create({
            data: {
                schoolId,
                type: dto.type,
                title: dto.title,
                message: dto.message,
                createdById: creatorId,
                expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
                metadata: dto.data ?? undefined,
            },
        });

        // 2. Resolve and Enqueue
        if (dto.isGlobal) {
            let skip = 0;
            const limit = 1000;
            while (true) {
                const memberships = await this.prisma.userSchool.findMany({
                    where: { schoolId, isActive: true },
                    select: { user: { select: { id: true, deviceTokens: true } } },
                    skip,
                    take: limit,
                    orderBy: { id: 'asc' },
                });

                if (memberships.length === 0) break;
                await this.enqueueUserBatches(notification.id, memberships.map(m => m.user), dto.title, dto.message, dto.data);
                skip += limit;
            }
            return notification;
        }

        const targetUserIds = new Set<number>(dto.targetUserIds || []);

        // Resolve roles if provided
        if (dto.targetRoleIds && dto.targetRoleIds.length > 0) {
            const roleMembers = await this.prisma.userSchool.findMany({
                where: {
                    schoolId,
                    isActive: true,
                    OR: [
                        { primaryRoleId: { in: dto.targetRoleIds } },
                        { roles: { some: { roleId: { in: dto.targetRoleIds } } } }
                    ]
                },
                select: { userId: true }
            });
            roleMembers.forEach(m => targetUserIds.add(m.userId));
        }

        if (targetUserIds.size > 0) {
            const users = await this.prisma.user.findMany({
                where: { id: { in: Array.from(targetUserIds) } },
                select: { id: true, deviceTokens: true }
            });
            await this.enqueueUserBatches(notification.id, users, dto.title, dto.message, dto.data);
        }

        return notification;
    }

    
    private async sendPushNotifications(targetConfigs: { token: string, userId: number }[], title: string, body: string, data: any) {
        const expoTokensConfigs = targetConfigs.filter(c => Expo.isExpoPushToken(c.token));
        const fcmTokensConfigs = targetConfigs.filter(c => !Expo.isExpoPushToken(c.token)); 

        const isEmergency = title.toUpperCase().includes('EMERGENCY') || title.toUpperCase().includes('URGENT');
        let displayTitle = isEmergency ? `🚨 ${title}` : `📢 Edulama: ${title}`;

        // 1. Send via Expo (for standard apps)
        if (expoTokensConfigs.length > 0) {
            const messages = expoTokensConfigs.map(config => ({
                to: config.token,
                sound: 'default' as const,
                title: displayTitle,
                body: body,
                data,
                subtitle: 'Edulama',
                badge: 1,
                _displayInForeground: true,
                priority: isEmergency ? ('high' as const) : ('default' as const),
                channelId: isEmergency ? 'emergency-alerts' : 'default',
            }));

            const chunks = this.expo.chunkPushNotifications(messages);
            for (const chunk of chunks) {
                try {
                    await this.expo.sendPushNotificationsAsync(chunk);
                } catch (error) {
                    this.logger.error('DEBUG: Error sending Expo push notifications', error);
                }
            }
        }

        // 2. Send via Firebase FCM for Notifee Full-Screen Intents (Data-Only for Enterprise Reliability)
        if (fcmTokensConfigs.length > 0 && admin.apps.length > 0) {
            const stringifiedData = Object.keys(data || {}).reduce((acc, key) => {
                const val = data[key];
                if (val !== null && val !== undefined) {
                    acc[key] = String(val);
                }
                return acc;
            }, {} as Record<string, string>);

            const FCM_CHUNK_SIZE = 500;
            for (let i = 0; i < fcmTokensConfigs.length; i += FCM_CHUNK_SIZE) {
                const chunkConfigs = fcmTokensConfigs.slice(i, i + FCM_CHUNK_SIZE);
                const chunkTokens = chunkConfigs.map(c => c.token);

                const fcmMessage: admin.messaging.MulticastMessage = {
                    tokens: chunkTokens,
                    data: {
                        title: displayTitle,
                        body: body,
                        isEmergency: isEmergency ? 'true' : 'false',
                        ...stringifiedData,
                    },
                    android: {
                        priority: 'high',
                    }
                };

                try {
                    const response = await admin.messaging().sendEachForMulticast(fcmMessage);
                    this.logger.log(`DEBUG: FCM Multicast Batch [${i}-${i + chunkConfigs.length}] sent. Successes: ${response.successCount}, Failures: ${response.failureCount}`);
                    
                    if (response.failureCount > 0) {
                        for (let idx = 0; idx < response.responses.length; idx++) {
                            const resp = response.responses[idx];
                            if (!resp.success) {
                                const tokenConfig = chunkConfigs[idx];
                                const errorCode = resp.error?.code;
                                const errorMessage = resp.error?.message;
                                
                                this.logger.error(`DEBUG: FCM individual failure! Token: ${tokenConfig.token.substring(0, 10)}... Error: ${errorMessage} (${errorCode})`);
                                
                                // Specific handling for stale tokens: CLEANUP
                                if (errorCode === 'messaging/registration-token-not-registered' || errorCode === 'messaging/invalid-registration-token') {
                                    this.logger.warn(` >> CLEANUP: Automatically removing stale token for user #${tokenConfig.userId}`);
                                    await this.removeStaleToken(tokenConfig.userId, tokenConfig.token);
                                }
                            }
                        }
                    }
                } catch (error) {
                    this.logger.error('DEBUG: Error sending FCM push notifications block', error);
                }
            }
        }
    }

    private async removeStaleToken(userId: number, token: string) {
        try {
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
                select: { deviceTokens: true }
            });
            if (!user || !user.deviceTokens) return;

            const tokens = (user.deviceTokens as Record<string, string>);
            const updatedTokens: Record<string, string> = {};
            
            // Re-build tokens object without the stale one
            let removedCount = 0;
            for (const [key, value] of Object.entries(tokens)) {
                if (value === token) {
                    removedCount++;
                    continue;
                }
                updatedTokens[key] = value;
            }

            if (removedCount > 0) {
                await this.prisma.user.update({
                    where: { id: userId },
                    data: { deviceTokens: updatedTokens }
                });
                this.logger.log(`[NotificationService] Successfully cleaned up ${removedCount} stale token(s) for user #${userId}`);
            }
        } catch (error) {
            this.logger.error(`[NotificationService] Failed to cleanup stale token for user #${userId}`, error);
        }
    }

    async findAll(schoolId: number) {
        return this.prisma.notification.findMany({
            where: { schoolId },
            include: {
                _count: {
                    select: { deliveries: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getMetadata(schoolId: number) {
        const roles = await this.prisma.role.findMany();
        const types = Object.values(NotificationType);

        // Hardcoded mapping logic as requested (since schema change was rejected)
        // "Select for per role for notification type"
        // We define which types are relevant/selectable for which role.
        const mapping: Record<string, NotificationType[]> = {};

        for (const role of roles) {
            const roleName = role.name.toUpperCase();
            let allowedTypes: NotificationType[] = [];

            if (roleName.includes('STUDENT')) {
                allowedTypes = [
                    NotificationType.HOMEWORK,
                    NotificationType.ATTENDANCE,
                    NotificationType.ANNOUNCEMENT,
                    NotificationType.GRIEVANCE,
                    NotificationType.ALERT
                ];
            } else if (roleName.includes('PARENT')) {
                allowedTypes = [
                    NotificationType.HOMEWORK,
                    NotificationType.ATTENDANCE,
                    NotificationType.ANNOUNCEMENT,
                    NotificationType.GRIEVANCE,
                    NotificationType.ALERT
                ];
            } else if (roleName.includes('TEACHER')) {
                allowedTypes = [
                    NotificationType.ANNOUNCEMENT,
                    NotificationType.GRIEVANCE,
                    NotificationType.SYSTEM,
                    NotificationType.ALERT
                ];
            } else if (roleName.includes('ADMIN') || roleName.includes('PRINCIPAL')) {
                allowedTypes = Object.values(NotificationType);
            } else {
                // Default for other roles
                allowedTypes = [NotificationType.ANNOUNCEMENT];
            }

            mapping[role.id] = allowedTypes;
        }

        return {
            roles,
            types,
            mapping
        };
    }
    async getMyNotifications(schoolId: number, userId: number, page = 1, limit = 50) {
        const skip = (page - 1) * limit;

        // Fetch notifications explicitly delivered to the user
        const deliveries = await this.prisma.notificationDelivery.findMany({
            where: {
                userId,
                notification: { schoolId }
            },
            include: {
                notification: true
            },
            orderBy: { deliveredAt: 'desc' },
            skip,
            take: limit
        });

        // Flatten the structure to return notification objects
        return deliveries.map(d => ({
            ...d.notification,
            isRead: !!d.readAt,
            deliveredAt: d.deliveredAt
        }));
    }
    async deleteMyNotification(schoolId: number, userId: number, notificationId: number) {
        // Delete the delivery record (unassign it from the user)
        // We use deleteMany to avoid errors if it doesn't exist or double deletion
        const result = await this.prisma.notificationDelivery.deleteMany({
            where: {
                notificationId: BigInt(notificationId),
                userId,
                notification: { schoolId }
            }
        });

        return { count: result.count };
    }

    async markMyNotificationAsRead(schoolId: number, userId: number, notificationId: number) {
        const result = await this.prisma.notificationDelivery.updateMany({
            where: {
                notificationId: BigInt(notificationId),
                userId,
                notification: { schoolId },
                readAt: null
            },
            data: {
                readAt: new Date()
            }
        });

        return { count: result.count };
    }
}
