import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsDate } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';

// DTOs
export class CreateExamScheduleDto {
    @IsNumber()
    @IsNotEmpty()
    examId: number;

    @IsNumber()
    @IsNotEmpty()
    classId: number;

    @IsNumber()
    @IsOptional()
    sectionId?: number;

    @IsNumber()
    @IsNotEmpty()
    subjectId: number;

    @IsDate()
    @Type(() => Date)
    @IsNotEmpty()
    examDate: Date;

    @IsString()
    @IsNotEmpty()
    startTime: string; // HH:mm

    @IsString()
    @IsNotEmpty()
    endTime: string; // HH:mm

    @IsNumber()
    @IsNotEmpty()
    duration: number; // minutes

    @IsNumber()
    @IsNotEmpty()
    maxMarks: number;

    @IsNumber()
    @IsOptional()
    passingMarks?: number;

    @IsNumber()
    @IsOptional()
    roomId?: number;

    @IsString()
    @IsOptional()
    instructions?: string;
}

export class UpdateExamScheduleDto {
    @IsDate()
    @Type(() => Date)
    @IsOptional()
    examDate?: Date;

    @IsString()
    @IsOptional()
    startTime?: string;

    @IsString()
    @IsOptional()
    endTime?: string;

    @IsNumber()
    @IsOptional()
    duration?: number;

    @IsNumber()
    @IsOptional()
    maxMarks?: number;

    @IsNumber()
    @IsOptional()
    passingMarks?: number;

    @IsNumber()
    @IsOptional()
    roomId?: number;

    @IsString()
    @IsOptional()
    instructions?: string;
}

@Injectable()
export class ExamScheduleService {
    constructor(private readonly prisma: PrismaService) { }

    // ============================================================
    // SCHEDULE CRUD
    // ============================================================

    async create(schoolId: number, academicYearId: number, dto: CreateExamScheduleDto) {
        // Verify exam exists
        const exam = await this.prisma.exam.findFirst({
            where: { id: dto.examId, schoolId, academicYearId },
        });

        if (!exam) {
            throw new NotFoundException('Exam not found');
        }

        // Check for duplicate schedule
        const existing = await this.prisma.examSchedule.findFirst({
            where: {
                examId: dto.examId,
                classId: dto.classId,
                sectionId: dto.sectionId,
                subjectId: dto.subjectId,
            },
        });

        if (existing) {
            throw new BadRequestException('Schedule already exists for this class/section/subject');
        }

        return this.prisma.examSchedule.create({
            data: {
                schoolId,
                academicYearId,
                ...dto,
            },
            include: {
                exam: { select: { name: true, code: true } },
                class: { select: { name: true } },
                section: { select: { name: true } },
                subject: { select: { name: true, code: true } },
                room: { select: { name: true, code: true } },
            },
        });
    }

    async findByExam(schoolId: number, academicYearId: number, examId: number) {
        return this.prisma.examSchedule.findMany({
            where: { schoolId, academicYearId, examId },
            include: {
                class: { select: { name: true } },
                section: { select: { name: true } },
                subject: { select: { name: true, code: true } },
                room: { select: { name: true, code: true } },
                _count: {
                    select: {
                        seatingArrangements: true,
                        invigilatorAssignments: true,
                        results: true,
                    },
                },
            },
            orderBy: [{ examDate: 'asc' }, { startTime: 'asc' }],
        });
    }

    async findOne(schoolId: number, academicYearId: number, id: number) {
        const schedule = await this.prisma.examSchedule.findFirst({
            where: { id, schoolId, academicYearId },
            include: {
                exam: true,
                class: true,
                section: true,
                subject: true,
                room: true,
                seatingArrangements: {
                    include: {
                        student: {
                            select: {
                                id: true,
                                fullName: true,
                                admissionNo: true,
                                rollNo: true,
                            },
                        },
                        room: { select: { name: true, code: true } },
                    },
                },
                invigilatorAssignments: {
                    include: {
                        teacher: {
                            include: {
                                user: { select: { name: true } },
                            },
                        },
                        room: { select: { name: true, code: true } },
                    },
                },
            },
        });

        if (!schedule) {
            throw new NotFoundException('Schedule not found');
        }

        return schedule;
    }

    async update(schoolId: number, academicYearId: number, id: number, dto: UpdateExamScheduleDto) {
        const schedule = await this.prisma.examSchedule.findFirst({
            where: { id, schoolId, academicYearId },
        });

        if (!schedule) {
            throw new NotFoundException('Schedule not found');
        }

        return this.prisma.examSchedule.update({
            where: { id },
            data: dto,
        });
    }

    async delete(schoolId: number, academicYearId: number, id: number) {
        const schedule = await this.prisma.examSchedule.findFirst({
            where: { id, schoolId, academicYearId },
        });

        if (!schedule) {
            throw new NotFoundException('Schedule not found');
        }

        // Check if schedule has results
        const resultsCount = await this.prisma.examResult.count({
            where: { scheduleId: id },
        });

        if (resultsCount > 0) {
            throw new BadRequestException('Cannot delete schedule with existing results');
        }

        await this.prisma.examSchedule.delete({ where: { id } });
        return { message: 'Schedule deleted successfully' };
    }

    // ============================================================
    // BULK OPERATIONS
    // ============================================================

    async createBulk(schoolId: number, academicYearId: number, schedules: CreateExamScheduleDto[]) {
        const created = await this.prisma.$transaction(
            schedules.map(dto =>
                this.prisma.examSchedule.create({
                    data: {
                        schoolId,
                        academicYearId,
                        ...dto,
                        examDate: new Date(dto.examDate),
                    },
                })
            )
        );

        return { count: created.length, schedules: created };
    }
}
