import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePrincipalNoticeDto } from './dto/create-principal-notice.dto';
import { PrincipalNoticeQueryDto } from './dto/principal-notice-query.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class PrincipalNoticeService {
    constructor(private readonly prisma: PrismaService) { }

    private async resolveTeacherProfile(schoolId: number, userId: number): Promise<number> {
        // Principals post as "Teachers" in the schema.
        // Check if profile exists
        const profile = await this.prisma.teacherProfile.findUnique({
            where: { userId }
        });

        if (profile) return profile.id;

        // If no profile exists for the Principal (common), create a system profile
        const newProfile = await this.prisma.teacherProfile.create({
            data: {
                userId,
                schoolId,
                isActive: true,
                joinDate: new Date(),
                // Minimal required fields
            }
        });
        return newProfile.id;
    }

    async create(schoolId: number, userId: number, dto: CreatePrincipalNoticeDto) {
        const teacherId = await this.resolveTeacherProfile(schoolId, userId);

        // Resolve Academic Year
        const academicYear = await this.prisma.academicYear.findFirst({
            where: { schoolId, status: 'ACTIVE' }
        });
        if (!academicYear) throw new NotFoundException('Active Academic Year not found');

        return this.prisma.notice.create({
            data: {
                schoolId,
                academicYearId: academicYear.id,
                title: dto.title,
                content: dto.content,
                priority: dto.priority,
                type: dto.type,
                classId: dto.classId,
                sectionId: dto.sectionId,
                subjectId: dto.subjectId,
                teacherId: teacherId,
                requiresAck: dto.requiresAck || false,
                attachments: {
                    create: dto.attachments?.map(a => ({
                        fileName: a.fileName,
                        fileUrl: a.fileUrl,
                        fileType: a.fileType
                    }))
                }
            }
        });
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
            where.AND = {
                OR: [
                    { title: { contains: search, mode: 'insensitive' } },
                    { content: { contains: search, mode: 'insensitive' } },
                ]
            };
        }

        if (type) where.type = type;
        if (classId) where.classId = classId;
        if (sectionId) where.sectionId = sectionId;
        if (teacherId) where.teacherId = teacherId;

        if (startDate && endDate) {
            where.createdAt = {
                gte: startDate,
                lte: endDate
            };
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
            teacherName: notice.teacher?.user?.name || 'Unknown',
            target: this.formatTarget(notice),
            ackCount: notice._count.acknowledgements
        }));

        return {
            data: mappedData,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
        };
    }

    async getStats(schoolId: number) {
        // Analytics for dashboard
        const totalNotices = await this.prisma.notice.count({ where: { schoolId, deletedAt: null } });

        // Group by Type
        const byType = await this.prisma.notice.groupBy({
            by: ['type'],
            where: { schoolId, deletedAt: null },
            _count: true
        });

        // Top posting teachers (Last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const topTeachers = await this.prisma.notice.groupBy({
            by: ['teacherId'],
            where: { schoolId, deletedAt: null, createdAt: { gte: thirtyDaysAgo } },
            _count: true,
            orderBy: { _count: { id: 'desc' } },
            take: 5
        });

        // Resolve teacher names in batch (Optimization)
        const teacherIds = topTeachers.map(t => t.teacherId);
        const teachers = await this.prisma.teacherProfile.findMany({
            where: { id: { in: teacherIds } },
            include: { user: { select: { name: true } } }
        });

        const teacherMap = new Map(teachers.map(t => [t.id, t.user.name]));

        const teacherStats = topTeachers.map(t => ({
            teacherName: teacherMap.get(t.teacherId) || 'Unknown',
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
                    }
                }
            }
        });

        if (!notice) throw new NotFoundException('Notice not found');

        // Calculate Ack %
        // Logic: Count total eligible students.
        // If Class Notice (no section) -> All active students in Class
        // If Section Notice -> All active students in Section
        // If Subject Notice -> All active students in Class/Section taking Subject (Approximate as Section/Class count for now or implement SubjectAssignment specific count)

        let totalStudents = 0;
        if (notice.sectionId) {
            totalStudents = await this.prisma.studentProfile.count({
                where: { schoolId, classId: notice.classId, sectionId: notice.sectionId, isActive: true }
            });
        } else {
            totalStudents = await this.prisma.studentProfile.count({
                where: { schoolId, classId: notice.classId, isActive: true }
            });
        }

        return {
            ...notice,
            teacherName: notice.teacher?.user?.name,
            target: this.formatTarget(notice),
            ackStats: {
                total: totalStudents,
                acknowledged: notice.acknowledgements.length,
                pending: Math.max(0, totalStudents - notice.acknowledgements.length),
                percentage: totalStudents > 0 ? ((notice.acknowledgements.length / totalStudents) * 100).toFixed(1) : 0
            }
        };
    }

    async remove(schoolId: number, id: number) {
        const notice = await this.prisma.notice.findFirst({
            where: { id, schoolId }
        });

        if (!notice) throw new NotFoundException('Notice not found');

        return this.prisma.notice.update({
            where: { id },
            data: { deletedAt: new Date() }
        });
    }

    private formatTarget(notice: {
        class?: { name: string },
        section?: { name: string } | null,
        subject?: { name: string } | null
    }) {
        let target = `${notice.class?.name || ''}`;
        if (notice.section) target += ` - ${notice.section.name}`;
        if (notice.subject) target += ` (${notice.subject.name})`;
        return target;
    }
}
