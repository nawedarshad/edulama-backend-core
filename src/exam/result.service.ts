import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsArray, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import { ResultStatus, GradeStatus } from '@prisma/client';

// DTOs
export class CreateResultDto {
    @IsNumber()
    @IsNotEmpty()
    studentId: number;

    @IsNumber()
    @IsOptional()
    marksObtained?: number;

    @IsBoolean()
    @IsOptional()
    isPresent?: boolean;

    @IsString()
    @IsOptional()
    remarks?: string;

    @IsString()
    @IsOptional()
    teacherNotes?: string;
}

export class UpdateResultDto {
    @IsNumber()
    @IsOptional()
    marksObtained?: number;

    @IsNumber()
    @IsOptional()
    percentage?: number;

    @IsString()
    @IsOptional()
    grade?: string;

    @IsNumber()
    @IsOptional()
    gradePoint?: number;

    @IsEnum(ResultStatus)
    @IsOptional()
    status?: ResultStatus;

    @IsEnum(GradeStatus)
    @IsOptional()
    gradeStatus?: GradeStatus;

    @IsBoolean()
    @IsOptional()
    isPresent?: boolean;

    @IsString()
    @IsOptional()
    remarks?: string;

    @IsString()
    @IsOptional()
    teacherNotes?: string;
}

export class BulkResultDto {
    @IsNumber()
    @IsNotEmpty()
    scheduleId: number;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateResultDto)
    @IsNotEmpty()
    results: CreateResultDto[];
}

export class PublishResultsDto {
    @IsNumber()
    @IsNotEmpty()
    examId: number;

    @IsArray()
    @IsNumber({}, { each: true })
    @IsOptional()
    scheduleIds?: number[]; // Optional: publish specific schedules only
}

@Injectable()
export class ResultService {
    constructor(private readonly prisma: PrismaService) { }

    // ============================================================
    // RESULT ENTRY
    // ============================================================

    async createResult(
        schoolId: number,
        academicYearId: number,
        examId: number,
        scheduleId: number,
        dto: CreateResultDto,
        evaluatedBy?: number
    ) {
        // Verify schedule exists
        const schedule = await this.prisma.examSchedule.findFirst({
            where: { id: scheduleId, schoolId, academicYearId, examId },
        });

        if (!schedule) {
            throw new NotFoundException('Schedule not found');
        }

        // Check for duplicate
        const existing = await this.prisma.examResult.findFirst({
            where: { scheduleId, studentId: dto.studentId },
        });

        if (existing) {
            throw new BadRequestException('Result already exists for this student');
        }

        // Calculate percentage and grade
        const marksObtained = dto.marksObtained || 0;
        const maxMarks = schedule.maxMarks;
        const percentage = (marksObtained / maxMarks) * 100;
        const passingMarks = schedule.passingMarks || maxMarks * 0.33;

        const gradeStatus: GradeStatus = !dto.isPresent
            ? 'ABSENT'
            : marksObtained >= passingMarks
                ? 'PASS'
                : 'FAIL';

        const grade = this.calculateGrade(percentage);

        return this.prisma.examResult.create({
            data: {
                schoolId,
                academicYearId,
                examId,
                scheduleId,
                studentId: dto.studentId,
                marksObtained,
                maxMarks,
                percentage,
                grade,
                gradeStatus,
                isPresent: dto.isPresent ?? true,
                remarks: dto.remarks,
                teacherNotes: dto.teacherNotes,
                evaluatedBy,
                evaluatedAt: new Date(),
                status: 'PENDING',
            },
            include: {
                student: {
                    select: {
                        id: true,
                        fullName: true,
                        admissionNo: true,
                        rollNo: true,
                    },
                },
            },
        });
    }

    async createBulkResults(
        schoolId: number,
        academicYearId: number,
        examId: number,
        dto: BulkResultDto,
        evaluatedBy?: number
    ) {
        const { scheduleId, results } = dto;

        // Get schedule
        const schedule = await this.prisma.examSchedule.findFirst({
            where: { id: scheduleId, schoolId, academicYearId, examId },
        });

        if (!schedule) {
            throw new NotFoundException('Schedule not found');
        }

        // Clear existing results
        await this.prisma.examResult.deleteMany({
            where: { scheduleId },
        });

        // Prepare result data
        const resultData = results.map(r => {
            const marksObtained = r.marksObtained || 0;
            const maxMarks = schedule.maxMarks;
            const percentage = (marksObtained / maxMarks) * 100;
            const passingMarks = schedule.passingMarks || maxMarks * 0.33;

            const gradeStatus: GradeStatus = !r.isPresent
                ? 'ABSENT'
                : marksObtained >= passingMarks
                    ? 'PASS'
                    : 'FAIL';

            return {
                schoolId,
                academicYearId,
                examId,
                scheduleId,
                studentId: r.studentId,
                marksObtained,
                maxMarks,
                percentage,
                grade: this.calculateGrade(percentage),
                gradeStatus,
                isPresent: r.isPresent ?? true,
                remarks: r.remarks,
                teacherNotes: r.teacherNotes,
                evaluatedBy,
                evaluatedAt: new Date(),
                status: 'PENDING' as ResultStatus,
            };
        });

        const created = await this.prisma.examResult.createMany({
            data: resultData,
        });

        return { count: created.count };
    }

    // ============================================================
    // RESULT UPDATE
    // ============================================================

    async updateResult(schoolId: number, academicYearId: number, id: number, dto: UpdateResultDto) {
        const result = await this.prisma.examResult.findFirst({
            where: { id, schoolId, academicYearId },
        });

        if (!result) {
            throw new NotFoundException('Result not found');
        }

        return this.prisma.examResult.update({
            where: { id },
            data: dto,
        });
    }

    // ============================================================
    // PUBLISH RESULTS
    // ============================================================

    async publishResults(schoolId: number, academicYearId: number, dto: PublishResultsDto) {
        const { examId, scheduleIds } = dto;

        const whereClause: any = {
            schoolId,
            academicYearId,
            examId,
            status: 'PENDING',
        };

        if (scheduleIds && scheduleIds.length > 0) {
            whereClause.scheduleId = { in: scheduleIds };
        }

        const updated = await this.prisma.examResult.updateMany({
            where: whereClause,
            data: {
                status: 'PUBLISHED',
            },
        });

        // Update exam result public flag
        await this.prisma.exam.update({
            where: { id: examId },
            data: { isResultPublic: true },
        });

        return {
            message: 'Results published successfully',
            count: updated.count,
        };
    }

    // ============================================================
    // QUERY
    // ============================================================

    async findBySchedule(schoolId: number, academicYearId: number, scheduleId: number) {
        return this.prisma.examResult.findMany({
            where: { schoolId, academicYearId, scheduleId },
            include: {
                student: {
                    select: {
                        id: true,
                        fullName: true,
                        admissionNo: true,
                        rollNo: true,
                    },
                },
            },
            orderBy: { student: { rollNo: 'asc' } },
        });
    }

    async findByStudent(schoolId: number, academicYearId: number, studentId: number, examId?: number) {
        return this.prisma.examResult.findMany({
            where: {
                schoolId,
                academicYearId,
                studentId,
                ...(examId && { examId }),
            },
            include: {
                exam: { select: { name: true, code: true, type: true } },
                schedule: {
                    select: {
                        examDate: true,
                        subject: { select: { name: true, code: true } },
                    },
                },
            },
            orderBy: { schedule: { examDate: 'desc' } },
        });
    }

    async getExamPerformance(schoolId: number, academicYearId: number, examId: number) {
        const results = await this.prisma.examResult.findMany({
            where: { schoolId, academicYearId, examId, status: 'PUBLISHED' },
            include: {
                schedule: {
                    select: {
                        subject: { select: { name: true, code: true } },
                        class: { select: { name: true } },
                    },
                },
            },
        });

        // Group by subject
        const subjectPerformance = results.reduce((acc: any, result) => {
            const subjectName = result.schedule.subject.name;
            if (!acc[subjectName]) {
                acc[subjectName] = {
                    subject: subjectName,
                    totalStudents: 0,
                    present: 0,
                    absent: 0,
                    passed: 0,
                    failed: 0,
                    totalMarks: 0,
                    maxPossible: 0,
                };
            }

            acc[subjectName].totalStudents++;
            if (result.isPresent) {
                acc[subjectName].present++;
                acc[subjectName].totalMarks += result.marksObtained || 0;
                if (result.gradeStatus === 'PASS') acc[subjectName].passed++;
                if (result.gradeStatus === 'FAIL') acc[subjectName].failed++;
            } else {
                acc[subjectName].absent++;
            }
            acc[subjectName].maxPossible += result.maxMarks;

            return acc;
        }, {});

        // Calculate averages
        Object.values(subjectPerformance).forEach((perf: any) => {
            perf.averagePercentage = perf.present > 0
                ? (perf.totalMarks / perf.maxPossible) * 100
                : 0;
            perf.passPercentage = perf.present > 0
                ? (perf.passed / perf.present) * 100
                : 0;
        });

        return Object.values(subjectPerformance);
    }

    // ============================================================
    // HELPERS
    // ============================================================

    private calculateGrade(percentage: number): string {
        if (percentage >= 90) return 'A+';
        if (percentage >= 80) return 'A';
        if (percentage >= 70) return 'B+';
        if (percentage >= 60) return 'B';
        if (percentage >= 50) return 'C+';
        if (percentage >= 40) return 'C';
        if (percentage >= 33) return 'D';
        return 'F';
    }
}
