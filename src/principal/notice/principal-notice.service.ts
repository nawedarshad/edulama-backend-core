import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePrincipalNoticeDto } from './dto/create-principal-notice.dto';
import { PrincipalNoticeQueryDto } from './dto/principal-notice-query.dto';
import { Prisma, NoticeType, NotificationType, AuditAction } from '@prisma/client';
import { NotificationService } from '../global/notification/notification.service';

@Injectable()
export class PrincipalNoticeService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly notificationService: NotificationService
    ) { }

    private async resolveTeacherProfile(schoolId: number, userId: number): Promise<number> {
        const profile = await this.prisma.teacherProfile.findUnique({
            where: { userId }
        });

        if (profile) return profile.id;

        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        
        const newProfile = await this.prisma.teacherProfile.create({
            data: {
                userId,
                schoolId,
                isActive: true,
                joinDate: new Date(),
                empCode: `ADMIN-${userId}-${Date.now().toString().slice(-4)}`,
            }
        });
        return newProfile.id;
    }

    async create(schoolId: number, userId: number, dto: CreatePrincipalNoticeDto) {
        const teacherId = await this.resolveTeacherProfile(schoolId, userId);

        const academicYear = await this.prisma.academicYear.findFirst({
            where: { schoolId, status: 'ACTIVE' }
        });
        if (!academicYear) throw new NotFoundException('Active Academic Year not found');

        const notice = await this.prisma.notice.create({
            data: {
                schoolId,
                academicYearId: academicYear.id,
                title: dto.title,
                content: dto.content,
                priority: dto.priority,
                type: dto.type,
                classId: dto.classId ?? null,
                sectionId: dto.sectionId ?? null,
                subjectId: dto.subjectId ?? null,
                teacherId: teacherId,
                requiresAck: dto.requiresAck ?? false,
                attachments: {
                    create: dto.attachments?.map(a => ({
                        fileName: a.fileName,
                        fileUrl: a.fileUrl,
                        fileType: a.fileType
                    }))
                }
            },
            include: {
                class: { select: { name: true } },
                section: { select: { name: true } }
            }
        });

        // Audit Log
        await this.prisma.auditLog.create({
            data: {
                schoolId,
                userId,
                entity: 'Notice',
                entityId: notice.id,
                action: AuditAction.CREATE,
                newValue: notice as any
            }
        });

        // ── Real-time Notification Loop ──────────────────────────────────────
        // Strategy: 
        // 1. If GENERAL/SCHOOL -> Global Notification to All Users
        // 2. If CLASS -> Notifications to Students/Parents in that Class/Section
        
        try {
            const isGlobal = dto.type === NoticeType.GENERAL || dto.type === NoticeType.SCHOOL;
            
            if (isGlobal) {
                await this.notificationService.create(schoolId, userId, {
                    title: `Notice: ${dto.title}`,
                    message: dto.content.substring(0, 100) + (dto.content.length > 100 ? '...' : ''),
                    type: NotificationType.ANNOUNCEMENT,
                    isGlobal: true,
                    data: { noticeId: notice.id, module: 'Notice' }
                });
            } else if (dto.classId) {
                // Fetch target users (Students and Parents of the target class)
                const targetUsers = await this.prisma.userSchool.findMany({
                    where: {
                        schoolId,
                        isActive: true,
                        user: {
                            OR: [
                                { studentProfile: { classId: dto.classId, sectionId: dto.sectionId ?? undefined } },
                                { parentProfile: { parentStudents: { some: { student: { classId: dto.classId, sectionId: dto.sectionId ?? undefined } } } } }
                            ]
                        }
                    },
                    select: { userId: true }
                });

                if (targetUsers.length > 0) {
                    await this.notificationService.create(schoolId, userId, {
                        title: `New Class Notice: ${dto.title}`,
                        message: dto.content.substring(0, 100),
                        type: NotificationType.ANNOUNCEMENT,
                        targetUserIds: targetUsers.map(u => u.userId),
                        data: { noticeId: notice.id, module: 'Notice' }
                    });
                }
            }
        } catch (error) {
            console.error('Failed to dispatch notifications for notice', error);
        }

        return notice;
    }

    async findAll(schoolId: number, query: PrincipalNoticeQueryDto) {
        const {
            page = 1,
            limit = 10,
            search,
            type,
            classId,
            sectionId,
            teacherId,
            startDate,
            endDate
        } = query;
        const skip = (page - 1) * limit;

        const where: Prisma.NoticeWhereInput = {
            schoolId,
            deletedAt: null
        };

        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { content: { contains: search, mode: 'insensitive' } },
            ];
        }

        if (type) where.type = type;
        if (classId) where.classId = classId;
        if (sectionId) where.sectionId = sectionId;
        if (teacherId) where.teacherId = teacherId;

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = startDate;
            if (endDate) where.createdAt.lte = endDate;
        }

        const [data, total] = await Promise.all([
            this.prisma.notice.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    teacher: { select: { user: { select: { name: true } } } },
                    class: { select: { name: true } },
                    section: { select: { name: true } },
                    subject: { select: { name: true } },
                    _count: { select: { acknowledgements: true } }
                }
            }),
            this.prisma.notice.count({ where })
        ]);

        const mappedData = data.map(notice => ({
            ...notice,
            teacherName: notice.teacher?.user?.name || 'Academic Office',
            target: this.formatTarget(notice),
            ackCount: notice._count.acknowledgements
        }));

        return {
            data: mappedData,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
        };
    }

    async getStats(schoolId: number) {
        const totalNotices = await this.prisma.notice.count({ where: { schoolId, deletedAt: null } });

        const byType = await this.prisma.notice.groupBy({
            by: ['type'],
            where: { schoolId, deletedAt: null },
            _count: true
        });

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const topTeachers = await this.prisma.notice.groupBy({
            by: ['teacherId'],
            where: { schoolId, deletedAt: null, createdAt: { gte: thirtyDaysAgo } },
            _count: true,
            orderBy: { _count: { id: 'desc' } },
            take: 5
        });

        const teacherIds = topTeachers.map(t => t.teacherId);
        const teachers = await this.prisma.teacherProfile.findMany({
            where: { id: { in: teacherIds } },
            include: { user: { select: { name: true } } }
        });

        const teacherMap = new Map(teachers.map(t => [t.id, t.user.name]));

        const teacherStats = topTeachers.map(t => ({
            teacherName: teacherMap.get(t.teacherId) || 'Principal',
            noticeCount: t._count
        }));

        return {
            totalNotices,
            breakdown: byType.reduce((acc, curr) => ({ ...acc, [curr.type]: curr._count }), {}),
            topTeachers: teacherStats
        };
    }

    async findOne(schoolId: number, id: number) {
        const notice = await this.prisma.notice.findFirst({
            where: { id, schoolId, deletedAt: null },
            include: {
                teacher: { include: { user: { select: { name: true } } } },
                class: { select: { name: true } },
                section: { select: { name: true } },
                subject: { select: { name: true } },
                attachments: true,
                acknowledgements: {
                    include: {
                        student: { select: { fullName: true, admissionNo: true, class: { select: { name: true } }, section: { select: { name: true } } } }
                    },
                    take: 50 // Limit initial load of acks
                },
                _count: { select: { acknowledgements: true } }
            }
        });

        if (!notice) throw new NotFoundException('Notice not found');

        let totalStudents = 0;
        const isGlobal = notice.type === NoticeType.GENERAL || notice.type === NoticeType.SCHOOL;

        if (isGlobal) {
            totalStudents = await this.prisma.studentProfile.count({ where: { schoolId, isActive: true } });
        } else if (notice.sectionId) {
            totalStudents = await this.prisma.studentProfile.count({
                where: { schoolId, classId: notice.classId as number, sectionId: notice.sectionId, isActive: true }
            });
        } else if (notice.classId) {
            totalStudents = await this.prisma.studentProfile.count({
                where: { schoolId, classId: notice.classId as number, isActive: true }
            });
        }

        return {
            ...notice,
            teacherName: notice.teacher?.user?.name || 'Academic Office',
            target: this.formatTarget(notice),
            ackStats: {
                total: totalStudents,
                acknowledged: notice._count.acknowledgements,
                pending: Math.max(0, totalStudents - notice._count.acknowledgements),
                percentage: totalStudents > 0 ? ((notice._count.acknowledgements / totalStudents) * 100).toFixed(1) : 0
            }
        };
    }

    async remove(schoolId: number, userId: number, id: number) {
        const notice = await this.prisma.notice.findFirst({
            where: { id, schoolId }
        });

        if (!notice) throw new NotFoundException('Notice not found');

        await this.prisma.auditLog.create({
            data: {
                schoolId,
                userId,
                entity: 'Notice',
                entityId: notice.id,
                action: AuditAction.DELETE
            }
        });

        return this.prisma.notice.update({
            where: { id },
            data: { deletedAt: new Date() }
        });
    }

    private formatTarget(notice: {
        type: NoticeType,
        class?: { name: string } | null,
        section?: { name: string } | null,
        subject?: { name: string } | null
    }) {
        if (notice.type === NoticeType.GENERAL || notice.type === NoticeType.SCHOOL) return 'All School';
        
        let target = `${notice.class?.name || 'N/A'}`;
        if (notice.section) target += ` - ${notice.section.name}`;
        if (notice.subject) target += ` (${notice.subject.name})`;
        return target;
    }
}
