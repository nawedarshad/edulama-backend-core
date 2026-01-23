import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StudentNoticeQueryDto } from './dto/student-notice-query.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class StudentNoticeService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll(schoolId: number, studentUserId: number, query: StudentNoticeQueryDto) {
        // 1. Get Student Profile to know ClassEx, Section, and Enrolled Subjects
        const student = await this.prisma.studentProfile.findUnique({
            where: { userId: studentUserId },
            include: {
                class: true,
                section: true,
            }
        });

        if (!student) {
            throw new NotFoundException('Student profile not found');
        }

        const { page = 1, limit = 10, search, type, subjectId } = query;
        const skip = (page - 1) * limit;

        // 2. Build Filter
        // Notices are visible if:
        // - schoolId matches
        // - status is PUBLISHED (if we have status, but schema currently doesn't have status, assuming all created are published or immediate)
        // - Target matches:
        //   - Class Notice: classId = student.classId AND (sectionId is null OR sectionId = student.sectionId)
        //   - Subject Notice: classId = student.classId AND (sectionId is null OR sectionId = student.sectionId) AND subjectId is one of student's subjects.

        // Ideally we should know which subjects the student takes.
        // Assuming student takes all subjects in the class/section or we need to check `SubjectAssignment` or `StudentSubject` if it exists.
        // For now, let's assume if it matches the class/section, they see it. 
        // If strict subject enrollment exists, we would filter `subjectId` IN (student.subjectIds).

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

        if (type) {
            where.type = type;
        }

        if (subjectId) {
            where.subjectId = subjectId;
        }

        // execute query
        const [data, total] = await Promise.all([
            this.prisma.notice.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    teacher: {
                        select: {
                            user: { select: { name: true } }, // Fallback if teacherProfile doesn't have name directly
                            // Or typically teacher linked to user. Let's check schema. TeacherProfile has no name, it links to User.
                        }
                    },
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

        // Map to simple structure indicating if acknowledged
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

    async findOne(schoolId: number, studentUserId: number, id: number) {
        const student = await this.prisma.studentProfile.findUnique({
            where: { userId: studentUserId },
        });
        if (!student) throw new NotFoundException('Student Not Found');

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

        if (!notice) throw new NotFoundException('Notice not found or access denied');

        const teacherUser = await this.prisma.user.findUnique({ where: { id: notice.teacher.userId } });

        return {
            ...notice,
            teacherName: teacherUser?.name || 'Teacher',
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
                classId: student.classId,
                OR: [{ sectionId: null }, { sectionId: student.sectionId }],
                deletedAt: null
            }
        });

        if (!notice) throw new NotFoundException('Notice not found');
        if (!notice.requiresAck) throw new BadRequestException('This notice does not require acknowledgement');

        // Check if already acknowledged
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
