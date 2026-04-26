import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StudentNoticeQueryDto } from './dto/student-notice-query.dto';
import { Prisma, NoticeType } from '@prisma/client';

@Injectable()
export class StudentNoticeService {
    constructor(private readonly prisma: PrismaService) { }

    private getTargetWhereClause(student: { classId: number, sectionId: number | null }): Prisma.NoticeWhereInput {
        return {
            OR: [
                { type: NoticeType.GENERAL },
                { type: NoticeType.SCHOOL },
                {
                    classId: student.classId,
                    OR: [
                        { sectionId: null },
                        { sectionId: student.sectionId }
                    ]
                }
            ]
        };
    }

    async findAll(schoolId: number, studentUserId: number, query: StudentNoticeQueryDto) {
        const student = await this.prisma.studentProfile.findUnique({
            where: { userId: studentUserId },
        });

        if (!student) throw new NotFoundException('Student profile not found');

        const { page = 1, limit = 10, search, type, subjectId } = query;
        const skip = (page - 1) * limit;

        const where: Prisma.NoticeWhereInput = {
            schoolId,
            deletedAt: null,
            ...this.getTargetWhereClause(student)
        };

        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { content: { contains: search, mode: 'insensitive' } },
            ];
        }

        if (type) where.type = type;
        if (subjectId) where.subjectId = subjectId;

        const [data, total] = await Promise.all([
            this.prisma.notice.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    teacher: { select: { user: { select: { name: true } } } },
                    subject: { select: { name: true } },
                    _count: {
                        select: {
                            acknowledgements: { where: { studentId: student.id } }
                        }
                    },
                    attachments: true
                }
            }),
            this.prisma.notice.count({ where })
        ]);

        return {
            data: data.map(notice => ({
                ...notice,
                teacherName: notice.teacher?.user?.name || 'Academic Office',
                isAcknowledged: notice._count.acknowledgements > 0
            })),
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
        };
    }

    async findOne(schoolId: number, studentUserId: number, id: number) {
        const student = await this.prisma.studentProfile.findUnique({
            where: { userId: studentUserId },
        });
        if (!student) throw new NotFoundException('Student Not Found');

        const notice = await this.prisma.notice.findFirst({
            where: {
                id,
                schoolId,
                deletedAt: null,
                ...this.getTargetWhereClause(student)
            },
            include: {
                teacher: { select: { user: { select: { name: true } } } },
                subject: { select: { name: true } },
                attachments: true,
                acknowledgements: { where: { studentId: student.id } }
            }
        });

        if (!notice) throw new NotFoundException('Notice not found or access denied');

        return {
            ...notice,
            teacherName: notice.teacher?.user?.name || 'Academic Office',
            isAcknowledged: notice.acknowledgements.length > 0
        };
    }

    async acknowledge(schoolId: number, studentUserId: number, id: number) {
        const student = await this.prisma.studentProfile.findUnique({
            where: { userId: studentUserId },
        });
        if (!student) throw new NotFoundException('Student Not Found');

        const notice = await this.prisma.notice.findFirst({
            where: {
                id,
                schoolId,
                deletedAt: null,
                ...this.getTargetWhereClause(student)
            }
        });

        if (!notice) throw new NotFoundException('Notice not found');
        if (!notice.requiresAck) throw new BadRequestException('This notice does not require acknowledgement');

        const existing = await this.prisma.noticeAck.findUnique({
            where: { noticeId_studentId: { noticeId: id, studentId: student.id } }
        });

        if (existing) return existing;

        return this.prisma.noticeAck.create({
            data: { noticeId: id, studentId: student.id }
        });
    }
}
