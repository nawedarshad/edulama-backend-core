import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationType } from '@prisma/client';
import { NotificationGateway } from './notification.gateway';
import { Expo } from 'expo-server-sdk';

@Injectable()
export class NotificationService {
    private readonly logger = new Logger(NotificationService.name);
    private expo = new Expo();

    constructor(
        private readonly prisma: PrismaService,
        private readonly gateway: NotificationGateway
    ) { }

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

        // 2. If target users provided, create deliveries
        if (dto.targetUserIds && dto.targetUserIds.length > 0) {
            // Verify users belong to school and fetch tokens
            const validUsers = await this.prisma.user.findMany({
                where: {
                    schoolId,
                    id: { in: dto.targetUserIds },
                },
                select: { id: true, deviceToken: true },
            });

            if (validUsers.length > 0) {
                await this.prisma.notificationDelivery.createMany({
                    data: validUsers.map(u => ({
                        notificationId: notification.id,
                        userId: u.id,
                    })),
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

                    // Collect Puh Token
                    if (user.deviceToken && Expo.isExpoPushToken(user.deviceToken)) {
                        pushTokens.push({ token: user.deviceToken, user });
                    }
                }

                // Send Push
                if (pushTokens.length > 0) {
                    this.sendPushNotifications(pushTokens.map(p => p.token), dto.title, dto.message, { notificationId: notification.id });
                }
            }
        }

        // 3. If target roles provided, fetch users and create deliveries
        if (dto.targetRoleIds && dto.targetRoleIds.length > 0) {
            const roleUsers = await this.prisma.user.findMany({
                where: {
                    schoolId,
                    roleId: { in: dto.targetRoleIds },
                    isActive: true // Only active users
                },
                select: { id: true, deviceToken: true },
            });

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

                        if (user.deviceToken && Expo.isExpoPushToken(user.deviceToken)) {
                            pushTokens.push(user.deviceToken);
                        }
                    }

                    // Send Push
                    if (pushTokens.length > 0) {
                        this.sendPushNotifications(pushTokens, dto.title, dto.message, { notificationId: notification.id });
                    }
                }
            }
        }

        return notification;
    }

    private async sendPushNotifications(tokens: string[], title: string, body: string, data: any) {
        const messages = tokens.map(token => ({
            to: token,
            sound: 'default' as const, // Fix type literal
            title,
            body,
            data,
        }));

        const chunks = this.expo.chunkPushNotifications(messages);

        for (const chunk of chunks) {
            try {
                const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
                this.logger.log(`Sent ${chunk.length} push notifications`);
                // Process tickets to check for errors/rejections if needed
            } catch (error) {
                this.logger.error('Error sending push notifications', error);
            }
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
}
