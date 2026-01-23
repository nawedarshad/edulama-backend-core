import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ParentNoticeQueryDto } from './dto/parent-notice-query.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ParentNoticeService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll(schoolId: number, parentUserId: number, query: ParentNoticeQueryDto) {
        const { studentId, page = 1, limit = 10, search, type, subjectId } = query;
        const skip = (page - 1) * limit;

        // 1. Verify Parent-Student Relation
        const parentStudent = await this.prisma.parentStudent.findFirst({
            where: {
                studentId,
                parent: {
                    userId: parentUserId
                }
            },
            include: {
                student: {
                    include: { class: true, section: true }
                }
            }
        });

        if (!parentStudent) {
            throw new ForbiddenException('You are not authorized to view notices for this student');
        }

        const student = parentStudent.student;

        // 2. Build Filter (Same as Student)
        const where: Prisma.NoticeWhereInput = {
            schoolId,
            deletedAt: null,
            classId: student.classId,
            OR: [
                { sectionId: null },
                { sectionId: student.sectionId }
            ]
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

        const mappedData = data.map((notice) => {
            return {
                ...notice,
                teacherName: notice.teacher?.user?.name || 'Teacher',
                isAcknowledged: notice._count.acknowledgements > 0
            };
        });

        return {
            data: mappedData,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
        };
    }

    async findOne(schoolId: number, parentUserId: number, id: number, studentId: number) {
        if (!studentId) throw new BadRequestException('Student ID is required');

        const parentStudent = await this.prisma.parentStudent.findFirst({
            where: { studentId, parent: { userId: parentUserId } },
            include: { student: true }
        });
        if (!parentStudent) throw new ForbiddenException('Access Denied');

        const student = parentStudent.student;

        // Notice for this student
        const notice = await this.prisma.notice.findFirst({
            where: {
                id,
                schoolId,
                classId: student.classId,
                OR: [{ sectionId: null }, { sectionId: student.sectionId }],
                deletedAt: null
            },
            include: {
                teacher: true,
                subject: { select: { name: true } },
                attachments: true,
                acknowledgements: {
                    where: { studentId: student.id }
                }
            }
        });

        if (!notice) throw new NotFoundException('Notice not found');

        const teacherUser = await this.prisma.user.findUnique({ where: { id: notice.teacher.userId } });

        return {
            ...notice,
            teacherName: teacherUser?.name || 'Teacher',
            isAcknowledged: notice.acknowledgements.length > 0
        };
    }

    async acknowledge(schoolId: number, parentUserId: number, id: number, studentId: number) {
        if (!studentId) throw new BadRequestException('Student ID is required');

        const parentStudent = await this.prisma.parentStudent.findFirst({
            where: { studentId, parent: { userId: parentUserId } },
            include: { student: true }
        });
        if (!parentStudent) throw new ForbiddenException('Access Denied');

        const student = parentStudent.student;

        const notice = await this.prisma.notice.findFirst({
            where: {
                id,
                schoolId,
                classId: student.classId,
                OR: [{ sectionId: null }, { sectionId: student.sectionId }],
                deletedAt: null
            }
        });

        if (!notice) throw new NotFoundException('Notice not found');
        if (!notice.requiresAck) throw new BadRequestException('Acknowledgement not required');

        // Check existing
        const existing = await this.prisma.noticeAck.findUnique({
            where: {
                noticeId_studentId: {
                    noticeId: id,
                    studentId: student.id
                }
            }
        });
        if (existing) return existing;

        return this.prisma.noticeAck.create({
            data: {
                noticeId: id,
                studentId: student.id
            }
        });
    }
}
