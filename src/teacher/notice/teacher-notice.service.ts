import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { NoticeQueryDto } from './dto/notice-query.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class TeacherNoticeService {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * Get all classes/sections/subjects this teacher is authorized to post to.
     */
    async getAuthorizedContexts(schoolId: number, teacherUserId: number) {
        const teacher = await this.prisma.teacherProfile.findUnique({
            where: { userId: teacherUserId },
        });

        if (!teacher) {
            throw new NotFoundException('Teacher profile not found');
        }

        const teacherId = teacher.id;

        // 1. Class Teacher (Can post to entire Class)
        const classHeads = await this.prisma.classHeadTeacher.findMany({
            where: { teacherId, schoolId },
            include: {
                class: {
                    select: { id: true, name: true },
                },
            },
        });

        // 2. Section Teacher (Can post to specific Section)
        const sectionTeachers = await this.prisma.sectionTeacher.findMany({
            where: { teacherId, schoolId },
            include: {
                section: {
                    select: { id: true, name: true, class: { select: { id: true, name: true } } },
                },
            },
        });

        // 3. Subject Teacher (Can post to Class + Subject)
        const classSubjects = await this.prisma.classSubject.findMany({
            where: { teacherProfileId: teacherId, schoolId },
            include: {
                class: { select: { id: true, name: true } },
                section: { select: { id: true, name: true } },
                subject: { select: { id: true, name: true } },
            },
        });

        return {
            classMentors: classHeads.map((ch) => ({
                type: 'CLASS_TEACHER',
                class: ch.class,
            })),
            sectionTeachers: sectionTeachers.map((st) => ({
                type: 'SECTION_TEACHER',
                class: st.section.class,
                section: { id: st.section.id, name: st.section.name },
            })),
            subjectTeachers: classSubjects.map((cs) => ({
                type: 'SUBJECT_TEACHER',
                class: cs.class,
                section: cs.section,
                subject: cs.subject,
            })),
        };
    }

    async create(schoolId: number, teacherUserId: number, dto: CreateNoticeDto) {
        const { attachments, classId, sectionId, subjectId, type, priority, requiresAck, title, content } = dto;

        const teacher = await this.prisma.teacherProfile.findUnique({
            where: { userId: teacherUserId },
        });
        if (!teacher) throw new NotFoundException('Teacher profile not found');

        // AUTHORIZATION CHECK
        await this.validateAuthorization(schoolId, teacher.id, classId, sectionId, subjectId, type);

        // Get current Academic Year
        const academicYear = await this.prisma.academicYear.findFirst({
            where: { schoolId, status: 'ACTIVE' }
        });
        if (!academicYear) throw new BadRequestException('No active Academic Year found');

        return this.prisma.$transaction(async (tx) => {
            const notice = await tx.notice.create({
                data: {
                    title,
                    content,
                    type,
                    priority,
                    requiresAck: !!requiresAck,
                    schoolId,
                    academicYearId: academicYear.id,
                    teacherId: teacher.id,
                    classId,
                    sectionId,
                    subjectId,
                }
            });

            if (attachments && attachments.length > 0) {
                await tx.noticeAttachment.createMany({
                    data: attachments.map(att => ({
                        ...att,
                        noticeId: notice.id
                    }))
                });
            }

            return notice;
        });
    }

    async findAll(schoolId: number, teacherUserId: number, query: NoticeQueryDto) {
        const teacher = await this.prisma.teacherProfile.findUnique({ where: { userId: teacherUserId } });
        if (!teacher) throw new NotFoundException('Teacher profile not found');

        const { page = 1, limit = 10, search, type, classId, subjectId } = query;
        const skip = (page - 1) * limit;

        const where: Prisma.NoticeWhereInput = {
            schoolId,
            teacherId: teacher.id,
            deletedAt: null,
        };

        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { content: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (type) where.type = type;
        if (classId) where.classId = classId;
        if (subjectId) where.subjectId = subjectId;

        const [data, total] = await Promise.all([
            this.prisma.notice.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    class: { select: { name: true } },
                    section: { select: { name: true } },
                    subject: { select: { name: true } },
                    _count: { select: { acknowledgements: true } },
                    attachments: true,
                }
            }),
            this.prisma.notice.count({ where })
        ]);

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
        };
    }

    async findOne(schoolId: number, teacherUserId: number, id: number) {
        const teacher = await this.prisma.teacherProfile.findUnique({ where: { userId: teacherUserId } });
        if (!teacher) throw new NotFoundException('Teacher profile not found');

        const notice = await this.prisma.notice.findFirst({
            where: { id, schoolId, teacherId: teacher.id, deletedAt: null },
            include: {
                class: { select: { name: true } },
                section: { select: { name: true } },
                subject: { select: { name: true } },
                attachments: true,
                acknowledgements: {
                    include: {
                        student: { select: { id: true, fullName: true, admissionNo: true } }
                    }
                }
            }
        });

        if (!notice) throw new NotFoundException('Notice not found');
        return notice;
    }

    async remove(schoolId: number, teacherUserId: number, id: number) {
        const teacher = await this.prisma.teacherProfile.findUnique({ where: { userId: teacherUserId } });
        if (!teacher) throw new NotFoundException('Teacher profile not found');

        const notice = await this.prisma.notice.findFirst({
            where: { id, schoolId, teacherId: teacher.id, deletedAt: null }
        });

        if (!notice) throw new NotFoundException('Notice not found');

        return this.prisma.notice.update({
            where: { id },
            data: { deletedAt: new Date() }
        });
    }

    private async validateAuthorization(
        schoolId: number,
        teacherId: number,
        classId: number,
        sectionId: number | undefined,
        subjectId: number | undefined,
        type: 'CLASS' | 'SUBJECT'
    ) {
        // 1. If TYPE=SUBJECT, subjectId is mandatory AND teacher must be teaching that subject in that class/section
        if (type === 'SUBJECT') {
            if (!subjectId) throw new BadRequestException('Subject ID is required for Subject Notices');

            // Check ClassSubject assignment
            const assignment = await this.prisma.classSubject.findFirst({
                where: {
                    schoolId,
                    teacherProfileId: teacherId,
                    classId,
                    subjectId,
                    // If sectionId is provided, strict check. If not, broadly checking if they teach this subject in ANY section of this class might be allowed, but safer to enforce section if known.
                    ...(sectionId ? { sectionId } : {})
                }
            });

            if (!assignment) {
                throw new ForbiddenException('You are not assigned to teach this subject in the selected class/section');
            }
        }

        // 2. If TYPE=CLASS
        if (type === 'CLASS') {
            // Teacher must be Class Teacher OR Section Teacher

            if (sectionId) {
                // Check Section Teacher
                const isSectionTeacher = await this.prisma.sectionTeacher.findFirst({
                    where: { schoolId, teacherId, sectionId }
                });
                // Also allowed if Class Teacher of parent class
                const isClassTeacher = await this.prisma.classHeadTeacher.findFirst({
                    where: { schoolId, teacherId, classId }
                });

                if (!isSectionTeacher && !isClassTeacher) {
                    throw new ForbiddenException('You are not the Class or Section teacher for this section');
                }
            } else {
                // Entire Class target -> Must be Class Teacher
                const isClassTeacher = await this.prisma.classHeadTeacher.findFirst({
                    where: { schoolId, teacherId, classId }
                });
                if (!isClassTeacher) {
                    throw new ForbiddenException('You must be the Class Teacher to post to the entire class');
                }
            }
        }
    }
}
