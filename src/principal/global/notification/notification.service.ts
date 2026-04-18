import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationType } from '@prisma/client';
import { NotificationGateway } from './notification.gateway';
import { Expo } from 'expo-server-sdk';
import * as admin from 'firebase-admin';

@Injectable()
export class NotificationService {
    private readonly logger = new Logger(NotificationService.name);
    private expo = new Expo();

    constructor(
        private readonly prisma: PrismaService,
        private readonly gateway: NotificationGateway
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
            },
        });

        // Helper to process users in chunks
        const processUserChunk = async (usersChunk: any[]) => {
            if (usersChunk.length === 0) return;
            await this.prisma.notificationDelivery.createMany({
                data: usersChunk.map((u: any) => ({ notificationId: notification.id, userId: u.id })),
                skipDuplicates: true,
            });

            const pushTokens: { token: string, user: any }[] = [];
            for (const user of usersChunk) {
                this.gateway.sendToUser(user.id, 'notification', {
                    title: dto.title,
                    message: dto.message,
                    type: dto.type,
                    createdAt: new Date(),
                });

                if (user.deviceTokens) {
                    const tokensMap = user.deviceTokens as Record<string, string>;
                    for (const t of Object.values(tokensMap)) {
                        pushTokens.push({ token: t, user });
                    }
                }
            }

            if (pushTokens.length > 0) {
                this.sendPushNotifications(
                    pushTokens.map(p => ({ token: p.token, userId: p.user.id })),
                    dto.title,
                    dto.message,
                    { notificationId: notification.id, ...(dto.data || {}) }
                );
            }
        };

        // 2. If global, fetch users in chunks via UserSchool to respect school isolation
        if (dto.isGlobal) {
            let skip = 0;
            const limit = 500;
            while (true) {
                const memberships = await this.prisma.userSchool.findMany({
                    where: { schoolId, isActive: true },
                    select: { user: { select: { id: true, deviceTokens: true } } },
                    skip,
                    take: limit,
                    orderBy: { id: 'asc' },
                });

                this.logger.log(`[NotificationService] Global: Found ${memberships.length} memberships for schoolId=${schoolId} (skip=${skip})`);

                if (memberships.length === 0) break;
                const chunk = memberships.map(m => m.user);
                await processUserChunk(chunk);
                skip += limit;
            }

            return notification;
        }

        // 3. If target users provided, create deliveries (already correctly scoped by schoolId check)
        if (dto.targetUserIds && dto.targetUserIds.length > 0) {
            // Verify users belong to school and fetch tokens via UserSchool
            const memberships = await this.prisma.userSchool.findMany({
                where: {
                    schoolId,
                    userId: { in: dto.targetUserIds },
                    isActive: true
                },
                select: { user: { select: { id: true, deviceTokens: true } } },
            });

            const validUsers = memberships.map(m => m.user);

            if (validUsers.length > 0) {
                await this.prisma.notificationDelivery.createMany({
                    data: validUsers.map(u => ({
                        notificationId: notification.id,
                        userId: u.id,
                    })),
                    skipDuplicates: true
                });

                // Notify users in real-time (Socket) + Push
                this.logger.log(`Notifying ${validUsers.length} users via gateway and push.`);

                const pushTokens: { token: string, user: any }[] = [];

                for (const user of validUsers) {
                    // Socket
                    this.gateway.sendToUser(user.id, 'notification', {
                        title: dto.title,
                        message: dto.message,
                        type: dto.type,
                        createdAt: new Date(),
                    });

                    // Collect Push Tokens
                    if (user.deviceTokens) {
                        const tokensMap = user.deviceTokens as Record<string, string>;
                        for (const t of Object.values(tokensMap)) {
                            pushTokens.push({ token: t, user });
                        }
                    }
                }

                // Send Push
                if (pushTokens.length > 0) {
                    this.sendPushNotifications(
                        pushTokens.map(p => ({ token: p.token, userId: p.user.id })),
                        dto.title,
                        dto.message,
                        {
                            notificationId: notification.id,
                            ...(dto.data || {}) // Merge custom data
                        }
                    );
                }
            }
        }

        // 4. If target roles provided, fetch users via UserSchoolRole
        if (dto.targetRoleIds && dto.targetRoleIds.length > 0) {
            const memberships = await this.prisma.userSchool.findMany({
                where: {
                    schoolId,
                    isActive: true,
                    OR: [
                        { primaryRoleId: { in: dto.targetRoleIds } },
                        { roles: { some: { roleId: { in: dto.targetRoleIds } } } }
                    ]
                },
                select: { user: { select: { id: true, deviceTokens: true } } },
            });

            const roleUsers = memberships.map(m => m.user);
            this.logger.log(`[NotificationService] Role-based: found ${roleUsers.length} users for roleIds=[${dto.targetRoleIds?.join(',')}]`);
            const usersWithTokens = roleUsers.filter(u => u.deviceTokens && Object.keys(u.deviceTokens).length > 0);
            this.logger.log(`[NotificationService] Role-based: ${usersWithTokens.length} users have device tokens`);

            if (roleUsers.length > 0) {
                // Avoid duplicates if user was also in targetUserIds
                const existingTargetIds = new Set(dto.targetUserIds || []);
                const newUsers = roleUsers.filter(u => !existingTargetIds.has(u.id));

                if (newUsers.length > 0) {
                    await this.prisma.notificationDelivery.createMany({
                        data: newUsers.map(u => ({
                            notificationId: notification.id,
                            userId: u.id,
                        })),
                        skipDuplicates: true,
                    });

                    const pushTokens: string[] = [];
                    for (const user of newUsers) {
                        // Socket
                        this.gateway.sendToUser(user.id, 'notification', {
                            title: dto.title,
                            message: dto.message,
                            type: dto.type,
                            createdAt: new Date(),
                        });

                        if (user.deviceTokens) {
                            const tokensMap = user.deviceTokens as Record<string, string>;
                            for (const t of Object.values(tokensMap)) {
                                pushTokens.push(t);
                            }
                        }
                    }

                    // Send Push
                    if (pushTokens.length > 0) {
                        this.sendPushNotifications(
                            newUsers.map(user => {
                                // A user might have multiple tokens, so we map them all
                                const tokensMap = user.deviceTokens as Record<string, string>;
                                return Object.values(tokensMap).map(t => ({ token: t, userId: user.id }));
                            }).flat(),
                            dto.title,
                            dto.message,
                            {
                                notificationId: notification.id,
                                ...(dto.data || {}) // Merge custom data
                            }
                        );
                    }
                }
            }
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
