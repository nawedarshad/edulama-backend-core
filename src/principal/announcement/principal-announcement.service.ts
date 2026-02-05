import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { NotificationService } from '../global/notification/notification.service';
import { NotificationType } from '@prisma/client';

import { AnnouncementQueryDto } from './dto/announcement-query.dto';
import { Prisma, AnnouncementPriority, AudienceType } from '@prisma/client';

@Injectable()
export class PrincipalAnnouncementService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly notificationService: NotificationService
    ) { }

    async create(schoolId: number, userId: number, dto: CreateAnnouncementDto) {
        const { audiences, attachments, academicYearId, ...data } = dto;

        // Verify Academic Year belongs to school
        const academicYear = await this.prisma.academicYear.findFirst({
            where: { id: academicYearId, schoolId },
        });
        if (!academicYear) {
            throw new NotFoundException('Academic Year not found for this school');
        }

        const result = await this.prisma.$transaction(async (tx) => {
            // 1. Create Announcement
            const announcement = await tx.announcement.create({
                data: {
                    ...data,
                    schoolId,
                    academicYearId,
                    createdById: userId,
                    priority: data.isEmergency ? AnnouncementPriority.CRITICAL : data.priority,
                    status: 'PUBLISHED', // Default to published for now, customizable later
                    publishedAt: new Date(),
                },
            });

            // 2. Create Audiences
            if (audiences && audiences.length > 0) {
                await tx.announcementAudience.createMany({
                    data: audiences.map((aud) => ({
                        ...aud,
                        schoolId,
                        announcementId: announcement.id,
                    })),
                });
            }

            // 3. Create Attachments
            if (attachments && attachments.length > 0) {
                await tx.announcementAttachment.createMany({
                    data: attachments.map((att) => ({
                        ...att,
                        schoolId,
                        announcementId: announcement.id,
                    })),
                });
            }

            return announcement;
        });

        // Send Notification (Fire & Forget to avoid blocking response)
        this.sendAnnouncementNotification(schoolId, userId, result, audiences).catch(err => {
            console.error('Failed to send announcement notification', err);
        });

        return result;
    }

    private async sendAnnouncementNotification(
        schoolId: number,
        creatorId: number,
        announcement: any,
        audiences: any[]
    ) {
        if (!audiences || audiences.length === 0) return;

        const targetUserIds = new Set<number>();
        const targetRoleIds = new Set<number>();

        // 1. Resolve Audiences
        for (const audience of audiences) {
            if (audience.studentId) targetUserIds.add(audience.studentId);
            if (audience.staffId) targetUserIds.add(audience.staffId);
            if (audience.roleId) targetRoleIds.add(audience.roleId);

            // Resolve Class/Section to Students
            if (audience.sectionId) {
                const students = await this.prisma.studentProfile.findMany({
                    where: { sectionId: audience.sectionId, schoolId },
                    select: { userId: true }
                });
                students.forEach(s => targetUserIds.add(s.userId));
            } else if (audience.classId) {
                const students = await this.prisma.studentProfile.findMany({
                    where: { classId: audience.classId, schoolId },
                    select: { userId: true }
                });
                students.forEach(s => targetUserIds.add(s.userId));
            }

            // Resolve generic types if needed (simplified for now)
            // Handle ALL_SCHOOL
            if (audience.type === AudienceType.ALL_SCHOOL) {
                const allUsers = await this.prisma.user.findMany({
                    where: { schoolId, isActive: true },
                    select: { id: true }
                });
                allUsers.forEach(u => targetUserIds.add(u.id));
            }
            // Handle Generic Role-based Audiences (TEACHER, STUDENT, PARENTS, STAFF)
            else if ([AudienceType.TEACHER, AudienceType.STUDENT, AudienceType.PARENTS, AudienceType.STAFF].includes(audience.type)) {
                // Fetch roles to find matching IDs
                // Optimization: Cache roles or fetch only needed ones
                const roles = await this.prisma.role.findMany();

                let roleNameKeyword = '';
                if (audience.type === AudienceType.TEACHER) roleNameKeyword = 'TEACHER';
                else if (audience.type === AudienceType.STUDENT) roleNameKeyword = 'STUDENT';
                else if (audience.type === AudienceType.PARENTS) roleNameKeyword = 'PARENT';
                else if (audience.type === AudienceType.STAFF) roleNameKeyword = 'STAFF'; // Or 'ADMIN', 'CLERK' etc? STAFF usually implies non-teaching employees.

                if (roleNameKeyword) {
                    const matchingRoles = roles.filter(r => r.name.toUpperCase().includes(roleNameKeyword));
                    matchingRoles.forEach(r => targetRoleIds.add(r.id));
                }
            }
        }

        const payload = {
            targetUserIds: Array.from(targetUserIds),
            targetRoleIds: Array.from(targetRoleIds),
            announcementId: announcement.id,
            isEmergency: announcement.isEmergency,
            priority: announcement.priority,
            voiceAudioUrl: announcement.voiceAudioUrl,
            voiceDuration: announcement.voiceDuration,
        };

        // 2. Send Standard Notification
        await this.notificationService.create(schoolId, creatorId, {
            title: 'New Announcement',
            message: announcement.title,
            type: NotificationType.ANNOUNCEMENT,
            ...payload
        });

        // 3. Send Emergency Alert if applicable
        if (announcement.isEmergency || announcement.priority === AnnouncementPriority.CRITICAL || announcement.priority === AnnouncementPriority.URGENT) {
            await this.notificationService.create(schoolId, creatorId, {
                title: announcement.isEmergency ? 'EMERGENCY ALERT' : 'URGENT ANNOUNCEMENT',
                message: `${announcement.isEmergency ? 'URGENT' : 'Attention'}: ${announcement.title}`,
                type: NotificationType.ALERT,
                ...payload
            });
        }
    }

    async findAll(schoolId: number, query: AnnouncementQueryDto) {
        const { page = 1, limit = 10, search, type, startDate, endDate, academicYearId } = query;
        const skip = (page - 1) * limit;

        const where: Prisma.AnnouncementWhereInput = {
            schoolId,
            deletedAt: null,
        };

        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { body: { contains: search, mode: 'insensitive' } },
            ];
        }

        if (type) {
            where.type = type;
        }

        if (academicYearId) {
            where.academicYearId = academicYearId;
        }

        if (startDate && endDate) {
            where.createdAt = {
                gte: new Date(startDate),
                lte: new Date(endDate),
            };
        }

        const [data, total] = await Promise.all([
            this.prisma.announcement.findMany({
                where,
                take: limit,
                skip,
                orderBy: { createdAt: 'desc' },
                include: {
                    audiences: true,
                    _count: {
                        select: {
                            acknowledgements: true
                        }
                    }
                }
            }),
            this.prisma.announcement.count({ where }),
        ]);

        return {
            data,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async getStats(schoolId: number, academicYearId?: number) {
        const where: Prisma.AnnouncementWhereInput = {
            schoolId,
            deletedAt: null,
            ...(academicYearId ? { academicYearId } : {}),
        };

        const [
            total,
            emergency,
            voice,
            byType,
            byStatus,
            byPriority
        ] = await Promise.all([
            // Total
            this.prisma.announcement.count({ where }),
            // Emergency
            this.prisma.announcement.count({ where: { ...where, isEmergency: true } }),
            // Voice
            this.prisma.announcement.count({ where: { ...where, voiceAudioUrl: { not: null } } }),
            // By Type
            this.prisma.announcement.groupBy({
                by: ['type'],
                where,
                _count: true,
            }),
            // By Status
            this.prisma.announcement.groupBy({
                by: ['status'],
                where,
                _count: true,
            }),
            // By Priority
            this.prisma.announcement.groupBy({
                by: ['priority'],
                where,
                _count: true,
            }),
        ]);

        // Helper to transform groupBy result to object
        const toMap = (data: any[], key: string) =>
            data.reduce((acc, curr) => ({ ...acc, [curr[key]]: curr._count }), {});

        return {
            total,
            emergency,
            voice,
            byType: toMap(byType, 'type'),
            byStatus: toMap(byStatus, 'status'),
            byPriority: toMap(byPriority, 'priority'),
        };
    }

    async findOne(schoolId: number, id: number) {
        const announcement = await this.prisma.announcement.findFirst({
            where: { id, schoolId, deletedAt: null },
            include: {
                audiences: true,
                attachments: true,
                createdBy: {
                    select: { id: true, name: true, photo: true },
                },
                _count: {
                    select: {
                        acknowledgements: true, // Total Acks
                    },
                },
            },
        });

        if (!announcement) {
            throw new NotFoundException(`Announcement #${id} not found`);
        }

        return announcement;
    }



    async remove(schoolId: number, id: number) {
        const announcement = await this.prisma.announcement.findFirst({
            where: { id, schoolId, deletedAt: null }
        });

        if (!announcement) {
            throw new NotFoundException(`Announcement #${id} not found`);
        }

        // Soft delete
        return this.prisma.announcement.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
    }
}
