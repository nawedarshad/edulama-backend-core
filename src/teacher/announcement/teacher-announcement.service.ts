import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AnnouncementStatus, AudienceType, AckType } from '@prisma/client';

@Injectable()
export class TeacherAnnouncementService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll(schoolId: number, userId: number, query: any) {
        const { page = 1, limit = 10, search, type } = query;
        const skip = (page - 1) * limit;

        // Get Teacher Profile ID
        const teacher = await this.prisma.teacherProfile.findFirst({
            where: { userId, schoolId },
            select: { id: true, user: { select: { roleId: true } } }
        });

        const teacherId = teacher?.id;
        const roleId = teacher?.user?.roleId;

        const where: any = {
            schoolId,
            status: AnnouncementStatus.PUBLISHED,
            deletedAt: null,
            audiences: {
                some: {
                    OR: [
                        { type: AudienceType.ALL_SCHOOL },
                        { type: AudienceType.TEACHER },
                        {
                            type: AudienceType.STAFF,
                            OR: [
                                { staffId: null },
                                { staffId: teacherId }
                            ]
                        },
                        {
                            type: AudienceType.ROLE,
                            roleId: roleId
                        }
                    ]
                }
            }
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

        if (query.priority) {
            where.priority = query.priority.toUpperCase();
        }

        if (query.unread === 'true') {
            where.acknowledgements = {
                none: {
                    userId: userId,
                    schoolId: schoolId
                }
            };
        }

        const [data, total] = await Promise.all([
            this.prisma.announcement.findMany({
                where,
                take: +limit,
                skip,
                orderBy: { priority: 'desc' }, // Emergency/Critical first
                include: {
                    attachments: true,
                    audiences: true,
                    acknowledgements: {
                        where: { userId: userId, ackType: AckType.READ }
                    },
                    createdBy: {
                        select: { id: true, name: true, photo: true }
                    }
                }
            }),
            this.prisma.announcement.count({ where }),
        ]);

        return {
            data,
            meta: {
                total,
                page: +page,
                limit: +limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async markAsRead(schoolId: number, userId: number, announcementId: number) {
        return this.prisma.announcementAck.upsert({
            where: {
                schoolId_announcementId_userId_ackType: {
                    schoolId,
                    announcementId,
                    userId,
                    ackType: AckType.READ
                }
            },
            update: {},
            create: {
                schoolId,
                announcementId,
                userId,
                ackType: AckType.READ
            }
        });
    }
}
