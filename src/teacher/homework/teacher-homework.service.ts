import {
    Injectable,
    NotFoundException,
    UnauthorizedException,
    ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateHomeworkDto } from './dto/create-homework.dto';
import { UpdateHomeworkDto } from './dto/update-homework.dto';
import { HomeworkQueryDto } from './dto/homework-query.dto';
import { MarkSubmissionDto } from './dto/mark-submission.dto';
import { HomeworkStatus } from '@prisma/client';

@Injectable()
export class TeacherHomeworkService {
    constructor(private readonly prisma: PrismaService) { }

    // ─────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────

    private async getTeacherId(userId: number): Promise<number> {
        const teacher = await this.prisma.teacherProfile.findUnique({
            where: { userId },
        });
        if (!teacher) {
            throw new UnauthorizedException('Teacher profile not found for this user.');
        }
        return teacher.id;
    }

    private async resolveAcademicYearId(schoolId: number, academicYearId?: number): Promise<number> {
        if (academicYearId) return academicYearId;
        const activeYear = await this.prisma.academicYear.findFirst({
            where: { schoolId, status: 'ACTIVE' },
        });
        if (!activeYear) {
            const latestYear = await this.prisma.academicYear.findFirst({
                where: { schoolId },
                orderBy: { startDate: 'desc' },
            });
            if (!latestYear) throw new NotFoundException('No academic year found for this school.');
            return latestYear.id;
        }
        return activeYear.id;
    }

    private async checkLockStatus(schoolId: number, userId: number, homeworkId: number): Promise<void> {
        const homework = await this.findOne(schoolId, userId, homeworkId);

        const now = new Date();
        const createdDate = new Date(homework.createdAt);
        const diffInHours = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60);

        if (diffInHours > 48) {
            throw new ForbiddenException('Homework submission status is locked (2 days passed since creation).');
        }
    }

    // ─────────────────────────────────────────────
    // CREATE HOMEWORK (auto-creates submission rows)
    // ─────────────────────────────────────────────

    async create(schoolId: number, userId: number, academicYearId: number | undefined, dto: CreateHomeworkDto) {
        const teacherId = await this.getTeacherId(userId);
        const resolvedYearId = await this.resolveAcademicYearId(schoolId, academicYearId);

        const homework = await this.prisma.homework.create({
            data: {
                schoolId,
                academicYearId: resolvedYearId,
                teacherId,
                groupId: dto.groupId,
                classId: dto.classId ?? null,
                sectionId: dto.sectionId ?? null,
                subjectId: dto.subjectId,
                title: dto.title,
                description: dto.description ?? null,
                dueDate: new Date(dto.dueDate),
                taughtToday: dto.taughtToday ?? null,
                attachments: (dto.attachments as any) ?? [],
            },
        });

        // Auto-create submission rows for all students in the section/group
        if (dto.sectionId) {
            const students = await this.prisma.studentProfile.findMany({
                where: { schoolId, academicYearId: resolvedYearId, sectionId: dto.sectionId, isActive: true },
                select: { id: true },
            });

            if (students.length > 0) {
                await this.prisma.homeworkSubmission.createMany({
                    data: students.map((s) => ({
                        homeworkId: homework.id,
                        studentId: s.id,
                        schoolId,
                        status: HomeworkStatus.PENDING,
                    })),
                    skipDuplicates: true,
                });
            }
        }

        return this.findOne(schoolId, userId, homework.id);
    }

    // ─────────────────────────────────────────────
    // LIST HOMEWORK (own only, filtered)
    // ─────────────────────────────────────────────

    async findAll(schoolId: number, userId: number, academicYearId: number | undefined, query: HomeworkQueryDto) {
        const teacherId = await this.getTeacherId(userId);
        const resolvedYearId = await this.resolveAcademicYearId(schoolId, academicYearId);

        const where: any = { schoolId, academicYearId: resolvedYearId, teacherId };

        if (query.groupId) where.groupId = query.groupId;
        if (query.classId) where.classId = query.classId;
        if (query.sectionId) where.sectionId = query.sectionId;
        if (query.subjectId) where.subjectId = query.subjectId;

        if (query.startDate && query.endDate) {
            where.dueDate = {
                gte: new Date(query.startDate),
                lte: new Date(query.endDate),
            };
        }

        const homeworks = await this.prisma.homework.findMany({
            where,
            include: {
                group: { select: { id: true, name: true } },
                class: { select: { id: true, name: true } },
                section: { select: { id: true, name: true } },
                subject: { select: { id: true, name: true, code: true } },
                _count: { select: { submissions: true } },
            },
            orderBy: { dueDate: 'desc' },
        });

        // Enrich with submission stats
        return Promise.all(
            homeworks.map(async (hw) => {
                const [total, submitted, pending] = await Promise.all([
                    this.prisma.homeworkSubmission.count({ where: { homeworkId: hw.id } }),
                    this.prisma.homeworkSubmission.count({ where: { homeworkId: hw.id, status: HomeworkStatus.SUBMITTED } }),
                    this.prisma.homeworkSubmission.count({ where: { homeworkId: hw.id, status: HomeworkStatus.PENDING } }),
                ]);
                return { ...hw, submissionStats: { total, submitted, pending, notSubmitted: total - submitted } };
            }),
        );
    }

    // ─────────────────────────────────────────────
    // GET ONE (with full submission list)
    // ─────────────────────────────────────────────

    async findOne(schoolId: number, userId: number, id: number) {
        const teacherId = await this.getTeacherId(userId);

        const homework = await this.prisma.homework.findFirst({
            where: { id, schoolId, teacherId },
            include: {
                group: { select: { id: true, name: true } },
                class: { select: { id: true, name: true } },
                section: { select: { id: true, name: true } },
                subject: { select: { id: true, name: true, code: true } },
                submissions: {
                    include: {
                        student: {
                            select: {
                                id: true,
                                fullName: true,
                                rollNo: true,
                                admissionNo: true,
                            },
                        },
                    },
                    orderBy: { student: { fullName: 'asc' } },
                },
            },
        });

        if (!homework) {
            throw new NotFoundException(`Homework #${id} not found`);
        }

        return homework;
    }

    // ─────────────────────────────────────────────
    // UPDATE (own homework only)
    // ─────────────────────────────────────────────

    async update(schoolId: number, userId: number, id: number, dto: UpdateHomeworkDto) {
        await this.findOne(schoolId, userId, id); // ownership check

        return this.prisma.homework.update({
            where: { id },
            data: {
                title: dto.title,
                description: dto.description,
                dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
                taughtToday: dto.taughtToday,
                attachments: dto.attachments as any,
            },
        });
    }

    // ─────────────────────────────────────────────
    // DELETE
    // ─────────────────────────────────────────────

    async remove(schoolId: number, userId: number, id: number) {
        await this.findOne(schoolId, userId, id); // ownership check
        return this.prisma.homework.delete({ where: { id } });
    }

    // ─────────────────────────────────────────────
    // MARK SINGLE SUBMISSION
    // ─────────────────────────────────────────────

    async markSubmission(schoolId: number, userId: number, homeworkId: number, dto: MarkSubmissionDto) {
        await this.checkLockStatus(schoolId, userId, homeworkId); // ownership and lock check

        return this.prisma.homeworkSubmission.upsert({
            where: { homeworkId_studentId: { homeworkId, studentId: dto.studentId } },
            create: {
                homeworkId,
                studentId: dto.studentId,
                schoolId,
                status: dto.status,
                remarks: dto.remarks ?? null,
                submittedAt: dto.status === HomeworkStatus.SUBMITTED ? new Date() : null,
            },
            update: {
                status: dto.status,
                remarks: dto.remarks ?? undefined,
                submittedAt: dto.status === HomeworkStatus.SUBMITTED ? new Date() : null,
            },
        });
    }

    // ─────────────────────────────────────────────
    // BULK MARK SUBMISSIONS
    // ─────────────────────────────────────────────

    async bulkMarkSubmissions(schoolId: number, userId: number, homeworkId: number, submissions: MarkSubmissionDto[]) {
        await this.checkLockStatus(schoolId, userId, homeworkId); // ownership and lock check

        const results = await Promise.all(
            submissions.map((s) =>
                this.prisma.homeworkSubmission.upsert({
                    where: { homeworkId_studentId: { homeworkId, studentId: s.studentId } },
                    create: {
                        homeworkId,
                        studentId: s.studentId,
                        schoolId,
                        status: s.status,
                        remarks: s.remarks ?? null,
                        submittedAt: s.status === HomeworkStatus.SUBMITTED ? new Date() : null,
                    },
                    update: {
                        status: s.status,
                        remarks: s.remarks ?? undefined,
                        submittedAt: s.status === HomeworkStatus.SUBMITTED ? new Date() : null,
                    },
                }),
            ),
        );

        return { updated: results.length, results };
    }
}
