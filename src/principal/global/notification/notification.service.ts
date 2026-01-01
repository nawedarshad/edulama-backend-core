import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationType } from '@prisma/client';

@Injectable()
export class NotificationService {
    private readonly logger = new Logger(NotificationService.name);

    constructor(private readonly prisma: PrismaService) { }

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
            // Verify users belong to school
            const validUsers = await this.prisma.user.findMany({
                where: {
                    schoolId,
                    id: { in: dto.targetUserIds },
                },
                select: { id: true },
            });

            if (validUsers.length > 0) {
                await this.prisma.notificationDelivery.createMany({
                    data: validUsers.map(u => ({
                        notificationId: notification.id,
                        userId: u.id,
                    })),
                });
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
                select: { id: true },
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
                }
            }
        }

        return notification;
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
                    NotificationType.EVENT,
                    NotificationType.ALERT
                ];
            } else if (roleName.includes('PARENT')) {
                allowedTypes = [
                    NotificationType.ATTENDANCE,
                    NotificationType.ANNOUNCEMENT,
                    NotificationType.EVENT,
                    NotificationType.ALERT
                ];
            } else if (roleName.includes('TEACHER')) {
                allowedTypes = [
                    NotificationType.ANNOUNCEMENT,
                    NotificationType.EVENT,
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
}
