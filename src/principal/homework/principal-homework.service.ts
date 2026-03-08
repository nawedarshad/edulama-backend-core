import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PrincipalHomeworkQueryDto } from './dto/principal-homework-query.dto';
import { OverrideHomeworkDto } from './dto/override-homework.dto';
import { CreateHomeworkDto } from '../../teacher/homework/dto/create-homework.dto';
import { MarkSubmissionDto } from '../../teacher/homework/dto/mark-submission.dto';
import { HomeworkStatus } from '@prisma/client';

@Injectable()
export class PrincipalHomeworkService {
    constructor(private readonly prisma: PrismaService) { }

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

    // ─────────────────────────────────────────────
    // PRINCIPAL CREATES HOMEWORK DIRECTLY
    // ─────────────────────────────────────────────

    async create(schoolId: number, principalUserId: number, academicYearId: number | undefined, dto: CreateHomeworkDto) {
        const resolvedYearId = await this.resolveAcademicYearId(schoolId, academicYearId);

        // For principal-created homework, we look up a teacher from teachers in the section
        // or allow no teacher assignment (teacherId from context)
        // We'll require dto to have a teacherId coming via a separate DTO field
        // Actually: We'll use a sentinel teacherId = 0 unless overridden; 
        // For simplicity: principal-created homework has no specific teacher ownership — 
        // We'll use the first teacher assigned to that section and subject if found, else skip.
        let teacherId: number | null = null;
        try {
            const assignment = await this.prisma.subjectAssignment.findFirst({
                where: {
                    schoolId,
                    academicYearId: resolvedYearId,
                    sectionId: dto.sectionId ?? undefined,
                    subjectId: dto.subjectId,
                },
                include: { teacher: { select: { id: true } } },
            });
            teacherId = assignment?.teacher?.id ?? null;
        } catch { }

        // If no teacher found principal assigns without teacher (teacherId must be non-null in schema)
        // We'll require a teacherId in the principal create DTO — fallback: throw.
        if (!teacherId) {
            // Try group-level assignment
            const groupAssignment = await this.prisma.subjectAssignment.findFirst({
                where: {
                    schoolId,
                    academicYearId: resolvedYearId,
                    groupId: dto.groupId,
                    subjectId: dto.subjectId,
                },
                include: { teacher: { select: { id: true } } },
            });
            teacherId = groupAssignment?.teacher?.id ?? null;
        }

        if (!teacherId) {
            throw new NotFoundException(
                'No teacher assigned to this subject in the given section/group. Assign a teacher first, or use the override endpoint to edit existing homework.',
            );
        }

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
                isOverriddenByPrincipal: true,
                overriddenById: principalUserId,
            },
        });

        // Auto create submission rows
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

        return homework;
    }

    // ─────────────────────────────────────────────
    // VIEW ALL HOMEWORK (school-wide)
    // ─────────────────────────────────────────────

    async findAll(schoolId: number, academicYearId: number | undefined, query: PrincipalHomeworkQueryDto) {
        const resolvedYearId = await this.resolveAcademicYearId(schoolId, academicYearId);

        const where: any = { schoolId, academicYearId: resolvedYearId };

        if (query.teacherId) where.teacherId = query.teacherId;
        if (query.groupId) where.groupId = query.groupId;
        if (query.classId) where.classId = query.classId;
        if (query.sectionId) where.sectionId = query.sectionId;
        if (query.subjectId) where.subjectId = query.subjectId;
        if (query.startDate && query.endDate) {
            where.dueDate = { gte: new Date(query.startDate), lte: new Date(query.endDate) };
        }

        const homeworks = await this.prisma.homework.findMany({
            where,
            include: {
                teacher: {
                    select: {
                        id: true,
                        user: { select: { name: true } },
                    },
                },
                group: { select: { id: true, name: true } },
                class: { select: { id: true, name: true } },
                section: { select: { id: true, name: true } },
                subject: { select: { id: true, name: true, code: true } },
                _count: { select: { submissions: true } },
            },
            orderBy: { dueDate: 'desc' },
        });

        // Attach submission stats
        return Promise.all(
            homeworks.map(async (hw) => {
                const [total, submitted] = await Promise.all([
                    this.prisma.homeworkSubmission.count({ where: { homeworkId: hw.id } }),
                    this.prisma.homeworkSubmission.count({
                        where: { homeworkId: hw.id, status: HomeworkStatus.SUBMITTED },
                    }),
                ]);
                return { ...hw, submissionStats: { total, submitted, notSubmitted: total - submitted } };
            }),
        );
    }

    // ─────────────────────────────────────────────
    // VIEW SINGLE HOMEWORK (with full submissions)
    // ─────────────────────────────────────────────

    async findOne(schoolId: number, id: number) {
        const homework = await this.prisma.homework.findFirst({
            where: { id, schoolId },
            include: {
                teacher: {
                    select: {
                        id: true,
                        user: { select: { name: true } },
                    },
                },
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
    // OVERRIDE (principal edits any homework)
    // ─────────────────────────────────────────────

    async override(schoolId: number, principalUserId: number, id: number, dto: OverrideHomeworkDto) {
        await this.findOne(schoolId, id); // existence check

        return this.prisma.homework.update({
            where: { id },
            data: {
                title: dto.title,
                description: dto.description,
                dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
                taughtToday: dto.taughtToday,
                attachments: dto.attachments as any,
                isOverriddenByPrincipal: true,
                overriddenById: principalUserId,
            },
        });
    }

    // ─────────────────────────────────────────────
    // DELETE (principal can delete any homework)
    // ─────────────────────────────────────────────

    async remove(schoolId: number, id: number) {
        await this.findOne(schoolId, id);
        return this.prisma.homework.delete({ where: { id } });
    }

    // ─────────────────────────────────────────────
    // MARK SINGLE SUBMISSION
    // ─────────────────────────────────────────────

    async markSubmission(schoolId: number, homeworkId: number, dto: MarkSubmissionDto) {
        await this.findOne(schoolId, homeworkId);

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

    async bulkMarkSubmissions(schoolId: number, homeworkId: number, submissions: MarkSubmissionDto[]) {
        await this.findOne(schoolId, homeworkId);

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
