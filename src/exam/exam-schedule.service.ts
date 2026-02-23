import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsDate } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';

// ============================================================
// DTOs
// ============================================================

// Step 2 DTO — Subject Mapping (no dates required)
export class CreateSubjectMappingDto {
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

    @IsNumber()
    @IsOptional()
    maxMarks?: number;

    @IsNumber()
    @IsOptional()
    passingMarks?: number;

    @IsNumber()
    @IsOptional()
    theoryMarks?: number;

    @IsNumber()
    @IsOptional()
    practicalMarks?: number;

    @IsString()
    @IsOptional()
    instructions?: string;

    @IsNumber()
    @IsOptional()
    roomId?: number;
}

export class BulkSubjectMappingDto {
    subjects: CreateSubjectMappingDto[];
}

export class UpdateSubjectMappingDto {
    @IsNumber()
    @IsOptional()
    maxMarks?: number;

    @IsNumber()
    @IsOptional()
    passingMarks?: number;

    @IsNumber()
    @IsOptional()
    theoryMarks?: number;

    @IsNumber()
    @IsOptional()
    practicalMarks?: number;

    @IsString()
    @IsOptional()
    instructions?: string;

    @IsNumber()
    @IsOptional()
    roomId?: number;
}

// Step 3 DTO — Full Schedule (marks + date/time)
export class CreateExamScheduleDto extends CreateSubjectMappingDto {
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

    @IsString()
    @IsOptional()
    session?: string;
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

    @IsString()
    @IsOptional()
    session?: string;

    @IsNumber()
    @IsOptional()
    maxMarks?: number;

    @IsNumber()
    @IsOptional()
    passingMarks?: number;

    @IsNumber()
    @IsOptional()
    theoryMarks?: number;

    @IsNumber()
    @IsOptional()
    practicalMarks?: number;

    @IsNumber()
    @IsOptional()
    roomId?: number;

    @IsString()
    @IsOptional()
    instructions?: string;
}

// Step 3 DTO — Assign timetable to an existing subject mapping
export class SetTimetableEntryDto {
    @IsNumber()
    @IsNotEmpty()
    scheduleId: number; // ID of existing ExamSchedule (subject mapping)

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

    @IsString()
    @IsOptional()
    session?: string;

    @IsNumber()
    @IsOptional()
    roomId?: number;
}

export class SetTimetableBulkDto {
    entries: SetTimetableEntryDto[];
}

// ============================================================
// SERVICE
// ============================================================

@Injectable()
export class ExamScheduleService {
    constructor(private readonly prisma: PrismaService) { }

    // ============================================================
    // STEP 2 — SUBJECT MAPPING
    // Define which subjects appear in an exam for each class,
    // along with mark structure (theory/practical split)
    // No date required at this stage.
    // ============================================================

    async addSubjectMapping(schoolId: number, academicYearId: number, dto: CreateSubjectMappingDto) {
        // Verify exam belongs to school + academic year
        const exam = await this.prisma.exam.findFirst({
            where: { id: dto.examId, schoolId, academicYearId },
        });
        if (!exam) throw new NotFoundException('Exam not found');

        // Validate that class belongs to this school
        const classRecord = await this.prisma.class.findFirst({
            where: { id: dto.classId, schoolId },
        });
        if (!classRecord) throw new NotFoundException('Class not found');

        // Validate marks logic
        this.validateMarks(dto.maxMarks, dto.theoryMarks, dto.practicalMarks, dto.passingMarks);

        // Check for duplicate
        const existing = await this.prisma.examSchedule.findFirst({
            where: {
                examId: dto.examId,
                classId: dto.classId,
                sectionId: dto.sectionId ?? null,
                subjectId: dto.subjectId,
            },
        });
        if (existing) throw new BadRequestException('This subject is already mapped to this exam for the given class/section');

        return this.prisma.examSchedule.create({
            data: {
                schoolId,
                academicYearId,
                examId: dto.examId,
                classId: dto.classId,
                sectionId: dto.sectionId,
                subjectId: dto.subjectId,
                maxMarks: dto.maxMarks ?? 100,
                passingMarks: dto.passingMarks,
                theoryMarks: dto.theoryMarks,
                practicalMarks: dto.practicalMarks,
                instructions: dto.instructions,
                roomId: dto.roomId,
            },
            include: {
                class: { select: { id: true, name: true } },
                section: { select: { id: true, name: true } },
                subject: { select: { id: true, name: true, code: true } },
            },
        });
    }

    async addSubjectMappingsBulk(schoolId: number, academicYearId: number, examId: number, mappings: CreateSubjectMappingDto[]) {
        const exam = await this.prisma.exam.findFirst({
            where: { id: examId, schoolId, academicYearId },
        });
        if (!exam) throw new NotFoundException('Exam not found');

        const results: any[] = [];
        for (const dto of mappings) {
            this.validateMarks(dto.maxMarks, dto.theoryMarks, dto.practicalMarks, dto.passingMarks);

            const existing = await this.prisma.examSchedule.findFirst({
                where: {
                    examId,
                    classId: dto.classId,
                    sectionId: dto.sectionId ?? null,
                    subjectId: dto.subjectId,
                },
            });

            if (existing) {
                const updated = await this.prisma.examSchedule.update({
                    where: { id: existing.id },
                    data: {
                        maxMarks: dto.maxMarks ?? 100,
                        passingMarks: dto.passingMarks,
                        theoryMarks: dto.theoryMarks,
                        practicalMarks: dto.practicalMarks,
                        instructions: dto.instructions,
                        roomId: dto.roomId,
                    },
                });
                results.push(updated);
            } else {
                const created = await this.prisma.examSchedule.create({
                    data: {
                        schoolId,
                        academicYearId,
                        examId,
                        classId: dto.classId,
                        sectionId: dto.sectionId,
                        subjectId: dto.subjectId,
                        maxMarks: dto.maxMarks ?? 100,
                        passingMarks: dto.passingMarks,
                        theoryMarks: dto.theoryMarks,
                        practicalMarks: dto.practicalMarks,
                        instructions: dto.instructions,
                        roomId: dto.roomId,
                    },
                });
                results.push(created);
            }
        }

        return { count: results.length, mappings: results };
    }

    async updateSubjectMapping(schoolId: number, academicYearId: number, id: number, dto: UpdateSubjectMappingDto) {
        const schedule = await this.prisma.examSchedule.findFirst({
            where: { id, schoolId, academicYearId },
        });
        if (!schedule) throw new NotFoundException('Subject mapping not found');

        this.validateMarks(
            dto.maxMarks ?? schedule.maxMarks,
            dto.theoryMarks ?? (schedule.theoryMarks !== null ? schedule.theoryMarks : undefined),
            dto.practicalMarks ?? (schedule.practicalMarks !== null ? schedule.practicalMarks : undefined),
            dto.passingMarks ?? (schedule.passingMarks !== null ? schedule.passingMarks : undefined),
        );

        return this.prisma.examSchedule.update({
            where: { id },
            data: {
                maxMarks: dto.maxMarks,
                passingMarks: dto.passingMarks,
                theoryMarks: dto.theoryMarks,
                practicalMarks: dto.practicalMarks,
                instructions: dto.instructions,
            },
            include: {
                class: { select: { id: true, name: true } },
                section: { select: { id: true, name: true } },
                subject: { select: { id: true, name: true, code: true } },
            },
        });
    }

    async getSubjectMappings(schoolId: number, academicYearId: number, examId: number, classId?: number) {
        return this.prisma.examSchedule.findMany({
            where: {
                schoolId,
                academicYearId,
                examId,
                ...(classId ? { classId } : {}),
            },
            include: {
                class: { select: { id: true, name: true } },
                section: { select: { id: true, name: true } },
                subject: { select: { id: true, name: true, code: true, color: true } },
                _count: { select: { results: true } },
            },
            orderBy: [{ classId: 'asc' }, { subjectId: 'asc' }],
        });
    }

    // ============================================================
    // STEP 3 — TIMETABLE ASSIGNMENT
    // Assign exam dates, times, and rooms to existing subject
    // mappings (ExamSchedule records created in Step 2).
    // ============================================================

    async setTimetableEntry(schoolId: number, academicYearId: number, dto: SetTimetableEntryDto) {
        const schedule = await this.prisma.examSchedule.findFirst({
            where: { id: dto.scheduleId, schoolId, academicYearId },
        });
        if (!schedule) throw new NotFoundException('Subject mapping not found');

        // Room conflict check: same room, same date, overlapping or same time
        if (dto.roomId) {
            const conflict = await this.prisma.examSchedule.findFirst({
                where: {
                    schoolId,
                    roomId: dto.roomId,
                    examDate: new Date(dto.examDate),
                    startTime: dto.startTime,
                    id: { not: dto.scheduleId }, // Exclude self
                },
            });
            if (conflict) {
                throw new BadRequestException(
                    `Room conflict: Room is already booked on ${dto.examDate} at ${dto.startTime}`
                );
            }
        }

        return this.prisma.examSchedule.update({
            where: { id: dto.scheduleId },
            data: {
                examDate: new Date(dto.examDate),
                startTime: dto.startTime,
                endTime: dto.endTime,
                duration: dto.duration,
                session: dto.session,
                roomId: dto.roomId,
            },
            include: {
                class: { select: { id: true, name: true } },
                section: { select: { id: true, name: true } },
                subject: { select: { id: true, name: true, code: true } },
                room: { select: { id: true, name: true, code: true } },
            },
        });
    }

    async setTimetableBulk(schoolId: number, academicYearId: number, examId: number, entries: SetTimetableEntryDto[]) {
        const exam = await this.prisma.exam.findFirst({
            where: { id: examId, schoolId, academicYearId },
        });
        if (!exam) throw new NotFoundException('Exam not found');

        const results: any[] = [];
        const errors: string[] = [];

        for (const entry of entries) {
            try {
                const updated = await this.setTimetableEntry(schoolId, academicYearId, entry);
                results.push(updated);
            } catch (err) {
                errors.push(`Schedule ${entry.scheduleId}: ${err.message}`);
            }
        }

        return {
            count: results.length,
            updated: results,
            errors: errors.length > 0 ? errors : undefined,
        };
    }

    async getTimetable(schoolId: number, academicYearId: number, examId: number, classId?: number) {
        const schedules = await this.prisma.examSchedule.findMany({
            where: {
                schoolId,
                academicYearId,
                examId,
                ...(classId ? { classId } : {}),
                examDate: { not: null }, // Only scheduled entries
            },
            include: {
                class: { select: { id: true, name: true } },
                section: { select: { id: true, name: true } },
                subject: { select: { id: true, name: true, code: true, color: true } },
                room: { select: { id: true, name: true, code: true } },
                _count: {
                    select: {
                        seatingArrangements: true,
                        invigilatorAssignments: true,
                        results: true,
                    },
                },
            },
            orderBy: [{ examDate: 'asc' }, { startTime: 'asc' }, { classId: 'asc' }],
        });

        // Group by date for a calendar-friendly response
        const grouped: Record<string, typeof schedules> = {};
        for (const s of schedules) {
            const dateKey = (s.examDate as Date).toISOString().split('T')[0];
            if (!grouped[dateKey]) grouped[dateKey] = [];
            grouped[dateKey].push(s);
        }

        return {
            totalScheduled: schedules.length,
            dates: Object.entries(grouped).map(([date, entries]) => ({
                date,
                count: entries.length,
                entries,
            })),
        };
    }

    async getTimetableSummary(schoolId: number, academicYearId: number, examId: number) {
        const [total, scheduled, unscheduled] = await Promise.all([
            this.prisma.examSchedule.count({ where: { schoolId, academicYearId, examId } }),
            this.prisma.examSchedule.count({ where: { schoolId, academicYearId, examId, examDate: { not: null } } }),
            this.prisma.examSchedule.count({ where: { schoolId, academicYearId, examId, examDate: null } }),
        ]);

        return { total, scheduled, unscheduled, isComplete: unscheduled === 0 && total > 0 };
    }

    async clearTimetable(schoolId: number, academicYearId: number, examId: number, classId?: number) {
        // Prevent clearing if any results exist
        const resultsCount = await this.prisma.examResult.count({
            where: { schoolId, academicYearId, examId },
        });
        if (resultsCount > 0) {
            throw new BadRequestException('Cannot clear timetable: exam has existing results');
        }

        const updateResult = await this.prisma.examSchedule.updateMany({
            where: {
                schoolId,
                academicYearId,
                examId,
                ...(classId ? { classId } : {}),
            },
            data: {
                examDate: null,
                startTime: null,
                endTime: null,
                duration: null,
                session: null,
                roomId: null,
            },
        });

        return { message: 'Timetable cleared successfully', count: updateResult.count };
    }

    // ============================================================
    // STEP 3 — FULL SCHEDULE CRUD (with date/time)
    // ============================================================

    async create(schoolId: number, academicYearId: number, dto: CreateExamScheduleDto) {
        const exam = await this.prisma.exam.findFirst({
            where: { id: dto.examId, schoolId, academicYearId },
        });
        if (!exam) throw new NotFoundException('Exam not found');

        const existing = await this.prisma.examSchedule.findFirst({
            where: {
                examId: dto.examId,
                classId: dto.classId,
                sectionId: dto.sectionId,
                subjectId: dto.subjectId,
            },
        });
        if (existing) throw new BadRequestException('Schedule already exists for this class/section/subject');

        this.validateMarks(dto.maxMarks, dto.theoryMarks, dto.practicalMarks, dto.passingMarks);

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

        if (!schedule) throw new NotFoundException('Schedule not found');
        return schedule;
    }

    async update(schoolId: number, academicYearId: number, id: number, dto: UpdateExamScheduleDto) {
        const schedule = await this.prisma.examSchedule.findFirst({
            where: { id, schoolId, academicYearId },
        });
        if (!schedule) throw new NotFoundException('Schedule not found');

        return this.prisma.examSchedule.update({
            where: { id },
            data: dto,
        });
    }

    async delete(schoolId: number, academicYearId: number, id: number) {
        const schedule = await this.prisma.examSchedule.findFirst({
            where: { id, schoolId, academicYearId },
        });
        if (!schedule) throw new NotFoundException('Schedule not found');

        const resultsCount = await this.prisma.examResult.count({
            where: { scheduleId: id },
        });
        if (resultsCount > 0) throw new BadRequestException('Cannot delete schedule with existing results');

        await this.prisma.examSchedule.delete({ where: { id } });
        return { message: 'Schedule deleted successfully' };
    }

    async createBulk(schoolId: number, academicYearId: number, schedules: CreateExamScheduleDto[]) {
        const created = await this.prisma.$transaction(
            schedules.map(dto =>
                this.prisma.examSchedule.create({
                    data: {
                        schoolId,
                        academicYearId,
                        ...dto,
                        examDate: dto.examDate ? new Date(dto.examDate) : undefined,
                    },
                })
            )
        );
        return { count: created.length, schedules: created };
    }

    // ============================================================
    // HELPERS
    // ============================================================

    private validateMarks(maxMarks?: number, theoryMarks?: number, practicalMarks?: number, passingMarks?: number) {
        if (theoryMarks !== undefined && practicalMarks !== undefined && maxMarks !== undefined) {
            if (theoryMarks + practicalMarks > maxMarks) {
                throw new BadRequestException(`Theory marks (${theoryMarks}) + Practical marks (${practicalMarks}) cannot exceed Max marks (${maxMarks})`);
            }
        }
        if (passingMarks !== undefined && maxMarks !== undefined && passingMarks > maxMarks) {
            throw new BadRequestException(`Passing marks (${passingMarks}) cannot exceed Max marks (${maxMarks})`);
        }
    }
}
