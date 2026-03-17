import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AnnouncementStatus, AudienceType, AckType } from '@prisma/client';

@Injectable()
export class ParentAnnouncementService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll(schoolId: number, userId: number, studentId: number, query: any) {
        const { page = 1, limit = 10, search, type, viewMode = 'PARENT' } = query;
        const skip = (page - 1) * limit;

        const where: any = {
            schoolId,
            status: AnnouncementStatus.PUBLISHED,
            deletedAt: null,
        };

        if (viewMode === 'STUDENT') {
            if (!studentId) {
                throw new Error('studentId is required for student viewMode');
            }

            // Verify parent-student relationship
            const relationship = await this.prisma.parentStudent.findFirst({
                where: {
                    studentId: studentId,
                    parent: { userId: userId },
                    student: { schoolId: schoolId }
                },
                include: {
                    student: {
                        select: { id: true, classId: true, sectionId: true, user: { select: { roleId: true } } }
                    }
                }
            });

            if (!relationship) {
                throw new ForbiddenException('You do not have permission to view announcements for this student');
            }

            const student = relationship.student;
            const roleId = student.user?.roleId;

            where.audiences = {
                some: {
                    OR: [
                        { type: AudienceType.ALL_SCHOOL },
                        { type: AudienceType.STUDENT, studentId: student.id },
                        { type: AudienceType.STUDENT, studentId: null },
                        { type: AudienceType.CLASS, classId: student.classId },
                        { type: AudienceType.SECTION, sectionId: student.sectionId },
                        { type: AudienceType.ROLE, roleId: roleId }
                    ]
                }
            };
        } else {
            // viewMode === 'PARENT'
            // Get Parent Profile for roleId if needed, though usually PARENTS type is enough
            const parent = await this.prisma.parentProfile.findFirst({
                where: { userId, parentStudents: { some: { student: { schoolId } } } },
                select: { user: { select: { roleId: true } } }
            });
            const roleId = parent?.user?.roleId;

            where.audiences = {
                some: {
                    OR: [
                        { type: AudienceType.ALL_SCHOOL },
                        { type: AudienceType.PARENTS },
                        { type: AudienceType.ROLE, roleId: roleId }
                    ]
                }
            };
        }

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
