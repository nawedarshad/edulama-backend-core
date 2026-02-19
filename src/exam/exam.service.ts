import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional, IsEnum, IsNumber, IsDate, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import { ExamType, ExamStatus, ExamCategory } from '@prisma/client';

// DTOs
export class CreateExamDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    code: string;

    @IsEnum(ExamType)
    @IsNotEmpty()
    type: ExamType;

    @IsEnum(ExamCategory)
    @IsNotEmpty()
    category: ExamCategory;

    @IsString()
    @IsOptional()
    description?: string;

    @IsDate()
    @Type(() => Date)
    @IsNotEmpty()
    startDate: Date;

    @IsDate()
    @Type(() => Date)
    @IsNotEmpty()
    endDate: Date;

    @IsNumber()
    @IsOptional()
    totalMarks?: number;

    @IsNumber()
    @IsOptional()
    passingMarks?: number;

    @IsDate()
    @Type(() => Date)
    @IsOptional()
    resultDate?: Date;

    @IsNumber({}, { each: true })
    @IsOptional()
    classIds?: number[];

    @IsBoolean()
    @IsOptional()
    classesContinue?: boolean;
}

export class UpdateExamDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsEnum(ExamStatus)
    @IsOptional()
    status?: ExamStatus;

    @IsEnum(ExamCategory)
    @IsOptional()
    category?: ExamCategory;

    @IsString()
    @IsOptional()
    description?: string;

    @IsDate()
    @Type(() => Date)
    @IsOptional()
    startDate?: Date;

    @IsDate()
    @Type(() => Date)
    @IsOptional()
    endDate?: Date;

    @IsNumber()
    @IsOptional()
    totalMarks?: number;

    @IsNumber()
    @IsOptional()
    passingMarks?: number;

    @IsDate()
    @Type(() => Date)
    @IsOptional()
    resultDate?: Date;

    @IsBoolean()
    @IsOptional()
    isResultPublic?: boolean;
}

import { CalendarService } from '../principal/calendar/calendar.service';
import { DayType } from '@prisma/client';

export class AutoScheduleDto {
    startDate: string | Date;
    endDate: string | Date;
    scheduleItems: { classId: number; subjectIds: number[] }[];
    jumbleSubjects?: boolean;
    maximizeGaps?: boolean;
}

@Injectable()
export class ExamService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly calendarService: CalendarService,
    ) { }

    // ============================================================
    // EXAM CRUD
    // ============================================================

    async create(schoolId: number, academicYearId: number, dto: CreateExamDto) {
        // Check for duplicate code
        const existing = await this.prisma.exam.findFirst({
            where: {
                schoolId,
                academicYearId,
                code: dto.code,
            },
        });

        if (existing) {
            throw new BadRequestException(`Exam with code "${dto.code}" already exists`);
        }

        const { classIds, ...rest } = dto;

        return this.prisma.exam.create({
            data: {
                schoolId,
                academicYearId,
                ...rest,
                classes: classIds ? {
                    connect: classIds.map(id => ({ id }))
                } : undefined,
            },
            include: {
                school: { select: { name: true } },
                academicYear: { select: { name: true } },
            },
        });
    }

    async findAll(schoolId: number, academicYearId: number, filters?: {
        status?: ExamStatus;
        type?: ExamType;
    }) {
        return this.prisma.exam.findMany({
            where: {
                schoolId,
                academicYearId,
                ...(filters?.status && { status: filters.status }),
                ...(filters?.type && { type: filters.type }),
            },
            include: {
                _count: {
                    select: {
                        schedules: true,
                        results: true,
                    },
                },
            },
            orderBy: { startDate: 'desc' },
        });
    }

    async findOne(schoolId: number, academicYearId: number, id: number) {
        const exam = await this.prisma.exam.findFirst({
            where: { id, schoolId, academicYearId },
            include: {
                schedules: {
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
                    orderBy: { examDate: 'asc' },
                },
                _count: {
                    select: {
                        schedules: true,
                        seatingArrangements: true,
                        invigilatorAssignments: true,
                        questionPapers: true,
                        results: true,
                    },
                },
                classes: {
                    select: { id: true, name: true },
                },
            },
        });

        if (!exam) {
            throw new NotFoundException('Exam not found');
        }

        return exam;
    }

    async update(schoolId: number, academicYearId: number, id: number, dto: UpdateExamDto) {
        const exam = await this.prisma.exam.findFirst({
            where: { id, schoolId, academicYearId },
        });

        if (!exam) {
            throw new NotFoundException('Exam not found');
        }

        return this.prisma.exam.update({
            where: { id },
            data: dto,
        });
    }

    async delete(schoolId: number, academicYearId: number, id: number) {
        const exam = await this.prisma.exam.findFirst({
            where: { id, schoolId, academicYearId },
        });

        if (!exam) {
            throw new NotFoundException('Exam not found');
        }

        // Check if exam has results
        const resultsCount = await this.prisma.examResult.count({
            where: { examId: id },
        });

        if (resultsCount > 0) {
            throw new BadRequestException('Cannot delete exam with existing results');
        }

        await this.prisma.exam.delete({ where: { id } });
        return { message: 'Exam deleted successfully' };
    }

    // ============================================================
    // STATISTICS
    // ============================================================

    async getExamStats(schoolId: number, academicYearId: number, examId: number) {
        const exam = await this.findOne(schoolId, academicYearId, examId);

        const totalSchedules = exam.schedules.length;
        const completedSchedules = exam.schedules.filter(
            s => new Date(s.examDate) < new Date()
        ).length;

        const totalStudents = await this.prisma.seatingArrangement.count({
            where: { examId },
        });

        const resultsEntered = await this.prisma.examResult.count({
            where: { examId, status: { not: 'PENDING' } },
        });

        const passedStudents = await this.prisma.examResult.count({
            where: { examId, gradeStatus: 'PASS' },
        });

        return {
            exam: {
                id: exam.id,
                name: exam.name,
                code: exam.code,
                status: exam.status,
            },
            schedules: {
                total: totalSchedules,
                completed: completedSchedules,
                pending: totalSchedules - completedSchedules,
            },
            students: {
                total: totalStudents,
                resultsEntered,
                resultsPending: totalStudents - resultsEntered,
                passed: passedStudents,
                failed: resultsEntered - passedStudents,
            },
        };
    }
    // ============================================================
    // AUTO SCHEDULE
    // ============================================================

    async autoSchedule(schoolId: number, dto: AutoScheduleDto) {
        const startDate = new Date(dto.startDate);
        const endDate = new Date(dto.endDate);
        const startStr = startDate.toISOString().split('T')[0];
        const endStr = endDate.toISOString().split('T')[0];

        // 1. Get Calendar (Valid working days)
        const calendar = await this.calendarService.generateCalendar(schoolId, startStr, endStr);
        const workingDays = calendar.days.filter(d => d.isWorking && d.type !== DayType.HOLIDAY);

        if (workingDays.length === 0) {
            throw new BadRequestException('No working days available in the selected range');
        }

        // 2. Schedule Generation
        const schedules: any[] = [];
        const totalWorkingDays = workingDays.length;

        for (const item of dto.scheduleItems) {
            const classId = item.classId;

            // Get subjects for this class
            let classSubjects = await this.prisma.subject.findMany({
                where: {
                    id: { in: item.subjectIds }
                },
                select: { id: true, name: true, code: true }
            });

            // A. Jumble Subjects if requested
            if (dto.jumbleSubjects) {
                // Fisher-Yates shuffle
                for (let i = classSubjects.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [classSubjects[i], classSubjects[j]] = [classSubjects[j], classSubjects[i]];
                }
            }

            // B. Allocation Logic
            classSubjects.forEach((subject, index) => {
                let dayIndex = 0;

                if (dto.maximizeGaps && classSubjects.length > 1 && totalWorkingDays >= classSubjects.length) {
                    // Spread evenly across available days: floor(i * available / count)
                    // We distribute such that the last exam is on the last possible day
                    dayIndex = Math.floor((index * (totalWorkingDays - 1)) / (classSubjects.length - 1));
                } else {
                    // Default tight packing
                    dayIndex = index;
                }

                if (dayIndex < totalWorkingDays) {
                    const examDay = workingDays[dayIndex];
                    schedules.push({
                        classId,
                        subjectId: subject.id,
                        subjectName: subject.name,
                        subjectCode: subject.code,
                        examDate: examDay.date,
                        startTime: '09:00',
                        endTime: '12:00',
                        duration: 180,
                        maxMarks: 100,
                        passingMarks: 33,
                    });
                }
            });
        }

        return schedules;
    }
}
