import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AnnouncementStatus, AudienceType, AckType } from '@prisma/client';

@Injectable()
export class StudentAnnouncementService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll(schoolId: number, userId: number, query: any) {
        const { page = 1, limit = 10, search, type } = query;
        const skip = (page - 1) * limit;

        // Get Student Profile
        const student = await this.prisma.studentProfile.findFirst({
            where: { userId, schoolId },
            select: { id: true, classId: true, sectionId: true, user: { select: { roleId: true } } }
        });

        if (!student) {
            return { data: [], meta: { total: 0, page: +page, limit: +limit, totalPages: 0 } };
        }

        const studentId = student.id;
        const classId = student.classId;
        const sectionId = student.sectionId;
        const roleId = student.user?.roleId;

        const where: any = {
            schoolId,
            status: AnnouncementStatus.PUBLISHED,
            deletedAt: null,
            audiences: {
                some: {
                    OR: [
                        { type: AudienceType.ALL_SCHOOL },
                        { type: AudienceType.STUDENT, studentId: studentId },
                        { type: AudienceType.STUDENT, studentId: null }, // General student audience
                        { type: AudienceType.CLASS, classId: classId },
                        { type: AudienceType.SECTION, sectionId: sectionId },
                        { type: AudienceType.ROLE, roleId: roleId }
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

        const priorityParam = query.priority?.toUpperCase();
        if (priorityParam === 'IMPORTANT') {
            where.AND = [
                {
                    OR: [
                        { isEmergency: true },
                        { priority: { in: ['CRITICAL', 'URGENT'] } }
                    ]
                }
            ];
        } else if (priorityParam) {
            where.priority = priorityParam;
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
                orderBy: { createdAt: 'desc' },
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

    async findOne(schoolId: number, userId: number, id: number) {
        // Basic check to ensure it belongs to school and is published
        return this.prisma.announcement.findFirst({
            where: { id, schoolId, status: AnnouncementStatus.PUBLISHED, deletedAt: null },
            include: {
                attachments: true,
                createdBy: { select: { id: true, name: true, photo: true } }
            }
        });
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
