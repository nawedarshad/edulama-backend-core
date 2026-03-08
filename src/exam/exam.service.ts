import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional, IsEnum, IsNumber, IsDate, IsBoolean, IsArray, IsISO8601 } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import { ExamType, ExamCategory, RoomType, GradingType, ExamScope, ExamScheduleStatus, ExamStatus, DayType } from '@prisma/client';

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

    @IsISO8601()
    @IsNotEmpty()
    startDate: string;

    @IsISO8601()
    @IsNotEmpty()
    endDate: string;

    @IsNumber()
    @IsOptional()
    totalMarks?: number;

    @IsNumber()
    @IsOptional()
    passingMarks?: number;

    @IsISO8601()
    @IsOptional()
    resultDate?: string;

    @IsNumber({}, { each: true })
    @IsOptional()
    classIds?: number[];

    @IsNumber({}, { each: true })
    @IsOptional()
    sectionIds?: number[];

    @IsBoolean()
    @IsOptional()
    classesContinue?: boolean;

    @IsNumber()
    @IsOptional()
    theoryMarks?: number;

    @IsNumber()
    @IsOptional()
    practicalMarks?: number;

    @IsBoolean()
    @IsOptional()
    autoAssignRooms?: boolean;

    @IsEnum(ExamScope)
    @IsOptional()
    examScope?: ExamScope;
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

    @IsEnum(ExamType)
    @IsOptional()
    type?: ExamType;

    @IsString()
    @IsOptional()
    code?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsISO8601()
    @IsOptional()
    startDate?: string;

    @IsISO8601()
    @IsOptional()
    endDate?: string;

    @IsNumber()
    @IsOptional()
    totalMarks?: number;

    @IsNumber()
    @IsOptional()
    passingMarks?: number;

    @IsISO8601()
    @IsOptional()
    resultDate?: string;

    @IsBoolean()
    @IsOptional()
    isResultPublic?: boolean;

    @IsEnum(GradingType)
    @IsOptional()
    gradingType?: GradingType;

    @IsBoolean()
    @IsOptional()
    classesContinue?: boolean;

    @IsNumber({}, { each: true })
    @IsOptional()
    classIds?: number[];

    @IsNumber({}, { each: true })
    @IsOptional()
    sectionIds?: number[];

    @IsNumber()
    @IsOptional()
    theoryMarks?: number;

    @IsNumber()
    @IsOptional()
    practicalMarks?: number;

    @IsBoolean()
    @IsOptional()
    autoAssignRooms?: boolean;

    @IsEnum(ExamScope)
    @IsOptional()
    examScope?: ExamScope;
}

import { CalendarService } from '../principal/calendar/calendar.service';
import { SchedulingEngine } from './scheduling-engine';

export class AutoScheduleDto {
    @IsNotEmpty()
    startDate: string | Date;

    @IsNotEmpty()
    endDate: string | Date;

    @IsArray()
    @IsNotEmpty()
    scheduleItems: { classId: number; sectionIds?: number[]; subjectIds: number[] }[];

    @IsBoolean()
    @IsOptional()
    jumbleSubjects?: boolean;

    @IsBoolean()
    @IsOptional()
    maximizeGaps?: boolean;

    @IsBoolean()
    @IsOptional()
    autoAssignRooms?: boolean;

    @IsNumber()
    @IsOptional()
    theoryMarks?: number;

    @IsNumber()
    @IsOptional()
    practicalMarks?: number;

    @IsArray()
    @IsNumber({}, { each: true })
    @IsOptional()
    roomIds?: number[];

    @IsNumber()
    @IsOptional()
    examId?: number;
}

@Injectable()
export class ExamService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly calendarService: CalendarService,
        private readonly scheduler: SchedulingEngine,
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

        const { classIds, sectionIds, autoAssignRooms, ...rest } = dto;

        // 1. Sanity Checks
        const start = new Date(dto.startDate);
        const end = new Date(dto.endDate);
        if (end < start) {
            throw new BadRequestException('End date cannot be before start date');
        }

        if (dto.resultDate) {
            const result = new Date(dto.resultDate);
            if (result < end) {
                throw new BadRequestException('Result date cannot be before exam end');
            }
        }

        // 2. Validate Section Ownership (Prevent Class 5 + Section of Class 6)
        if (sectionIds && sectionIds.length > 0) {
            const validSections = await this.prisma.section.findMany({
                where: {
                    id: { in: sectionIds },
                    classId: { in: classIds },
                },
                select: { id: true }
            });

            if (validSections.length !== sectionIds.length) {
                throw new BadRequestException('Invalid section-class mapping: One or more sections do not belong to the selected classes');
            }
        }

        return this.prisma.exam.create({
            data: {
                schoolId,
                academicYearId,
                ...rest,
                autoAssignRooms: autoAssignRooms ?? false,
                classes: classIds ? {
                    connect: classIds.map(id => ({ id }))
                } : undefined,
                sections: sectionIds ? {
                    connect: sectionIds.map(id => ({ id }))
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
                sections: {
                    select: { id: true, name: true, classId: true },
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
            include: {
                classes: { select: { id: true } },
                sections: { select: { id: true } }
            },
        });

        if (!exam) {
            throw new NotFoundException('Exam not found');
        }

        if (exam.status === ExamStatus.LOCKED) {
            throw new BadRequestException('Cannot update a LOCKED exam');
        }

        const { classIds, sectionIds, autoAssignRooms, ...rest } = dto;

        // 1. Sanity Checks (Dates)
        const startDate = dto.startDate ? new Date(dto.startDate) : new Date(exam.startDate);
        const endDate = dto.endDate ? new Date(dto.endDate) : new Date(exam.endDate);

        if (endDate < startDate) {
            throw new BadRequestException('End date cannot be before start date');
        }

        const resultDateStr = dto.resultDate || (exam.resultDate ? exam.resultDate.toISOString() : null);
        if (resultDateStr) {
            const resultDate = new Date(resultDateStr);
            if (resultDate < endDate) {
                throw new BadRequestException('Result date cannot be before exam end');
            }
        }

        // 2. Validate Section Ownership
        const classesToVerify = classIds || exam.classes.map(c => c.id);
        const sectionsToVerify = sectionIds || exam.sections.map(s => s.id);

        if (sectionsToVerify.length > 0) {
            const validSections = await this.prisma.section.findMany({
                where: {
                    id: { in: sectionsToVerify },
                    classId: { in: classesToVerify },
                },
                select: { id: true }
            });

            if (validSections.length !== sectionsToVerify.length) {
                throw new BadRequestException('Invalid section-class mapping: One or more sections do not belong to the selected classes');
            }
        }

        // 3. Safe Class Removal Check
        if (classIds) {
            const currentClassIds = exam.classes.map(c => c.id);
            const removedClassIds = currentClassIds.filter(cid => !classIds.includes(cid));

            for (const classId of removedClassIds) {
                const blockers = await this.prisma.examSchedule.count({
                    where: {
                        examId: id,
                        classId,
                        OR: [
                            { results: { some: {} } },
                            { seatingArrangements: { some: {} } },
                            { invigilatorAssignments: { some: {} } },
                        ],
                    },
                });

                if (blockers > 0) {
                    throw new BadRequestException(`Cannot remove class ID ${classId} because it already has associated exam schedules with results, seating, or invigilators.`);
                }

                // If no blockers, we can clean up the empty schedules
                await this.prisma.examSchedule.deleteMany({
                    where: { examId: id, classId },
                });
            }
        }

        return this.prisma.exam.update({
            where: { id },
            data: {
                ...rest,
                autoAssignRooms: autoAssignRooms ?? exam.autoAssignRooms,
                classes: classIds ? {
                    set: classIds.map(id => ({ id }))
                } : undefined,
                sections: sectionIds ? {
                    set: sectionIds.map(id => ({ id }))
                } : undefined,
            },
        });
    }

    async delete(schoolId: number, academicYearId: number, id: number) {
        const exam = await this.prisma.exam.findFirst({
            where: { id, schoolId, academicYearId },
        });

        if (!exam) {
            throw new NotFoundException('Exam not found');
        }

        if (exam.status === ExamStatus.LOCKED) {
            throw new BadRequestException('Cannot delete a LOCKED exam');
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
            s => s.status === ExamScheduleStatus.CONDUCTED || s.status === ExamScheduleStatus.RESULTS_ENTERED
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

    async autoSchedule(schoolId: number, academicYearId: number, dto: AutoScheduleDto & { examId?: number }) {
        const DEFAULT_DURATION = 180; // 3 hours
        // Default: 1 exam per class per day (whole-school exam standard)
        // Set to 2+ only if multi-session per class is explicitly needed
        const MAX_EXAMS_PER_CLASS_PER_DAY = 1;
        const failures: { subject: string; classId: number; reason: string }[] = [];

        // --- FIX 8: Status Gate ---
        if (dto.examId) {
            const exam = await this.prisma.exam.findUnique({
                where: { id: dto.examId },
                select: { status: true }
            });
            if (exam?.status === ExamStatus.LOCKED) {
                throw new BadRequestException('Cannot auto-schedule a LOCKED exam');
            }
        }

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

        const totalWorkingDays = workingDays.length;

        // 2. Pre-fetch Data
        const roomWhere: any = { schoolId, status: 'ACTIVE' };
        if (dto.roomIds && dto.roomIds.length > 0) roomWhere.id = { in: dto.roomIds };
        const availableRooms = await this.prisma.room.findMany({
            where: roomWhere,
            select: { id: true, name: true, code: true, capacity: true, benches: true, studentsPerBench: true, roomType: true },
        });

        availableRooms.sort((a, b) => {
            if (a.roomType === 'CLASSROOM' && b.roomType !== 'CLASSROOM') return -1;
            if (a.roomType !== 'CLASSROOM' && b.roomType === 'CLASSROOM') return 1;
            return (b.benches * b.studentsPerBench) - (a.benches * a.studentsPerBench);
        });

        const studentCountGroup = await this.prisma.studentProfile.groupBy({
            by: ['classId'],
            _count: { _all: true },
            where: { schoolId, isActive: true }
        });
        const classStudentCounts = new Map(studentCountGroup.map(g => [g.classId, g._count._all]));

        const dbExams = await this.prisma.examSchedule.findMany({
            where: {
                schoolId,
                examDate: { gte: startDate, lte: endDate },
                ...(dto.examId && { NOT: { examId: dto.examId } })
            },
            select: { roomId: true, examDate: true, startTime: true, duration: true, classId: true }
        });

        // 3. Pre-fetch Class Exceptions for involved classes
        const involvedClassIds = dto.scheduleItems.map(i => i.classId);
        const classExceptions = await this.prisma.calendarException.findMany({
            where: {
                schoolId,
                classId: { in: involvedClassIds },
                date: { gte: startDate, lte: endDate }
            }
        });
        const classExMap = new Map<string, DayType>(); // `${classId}-${date}` -> DayType
        classExceptions.forEach(ex => {
            classExMap.set(`${ex.classId}-${ex.date.toISOString().split('T')[0]}`, ex.type);
        });

        const timeToMin = (t: string) => {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };

        // --- FIX: State Trackers ---
        const roomState = new Map<string, { usedSeats: number; batchCount: number; dbCount: number; mode: 'SINGLE' | 'MULTI'; classesInRoom: Set<number> }>();
        const classSessionMap = new Set<string>(); // `${classId}-${date}-${startTime}`
        const classDayCount = new Map<string, number>(); // `${classId}-${date}`
        const classDayRoom = new Map<string, number>(); // `${classId}-${date}` -> roomId

        const generatedSchedules: any[] = [];

        // --- FIX 6: Deterministic Randomness ---
        // We use a fixed seed if provided, or derive one from the input
        const baseSeed = dto.jumbleSubjects ? (dto.examId || 42) : 0;
        const roomUsageCount = new Map<number, number>();
        availableRooms.forEach(r => roomUsageCount.set(r.id, 0));

        // --- ROOM TEMPLATE INITIALIZATION ---
        const templateMap = await this.initRoomTemplates(schoolId, academicYearId, dto, availableRooms, classStudentCounts);

        for (const item of dto.scheduleItems) {
            const classId = item.classId;
            const studentCount = classStudentCounts.get(classId) || 0;
            const effectiveStudentCount = Math.max(studentCount, 1);

            const classSubjects = await this.prisma.classSubject.findMany({
                where: {
                    classId: classId,
                    subjectId: { in: item.subjectIds }
                },
                include: { subject: true }
            });

            const subjectsList = classSubjects.map(cs => ({
                id: cs.subject.id,
                name: cs.subject.name,
                code: cs.subject.code,
                type: cs.type
            }));

            if (dto.jumbleSubjects) {
                let seed = baseSeed + classId;
                for (let i = subjectsList.length - 1; i > 0; i--) {
                    seed = (seed * 9301 + 49297) % 233280;
                    const j = Math.floor((seed / 233280) * (i + 1));
                    [subjectsList[i], subjectsList[j]] = [subjectsList[j], subjectsList[i]];
                }
            }

            const subjectsCount = subjectsList.length;
            // subjectsPerDay is informational — we enforce 1-per-day via MAX_EXAMS_PER_CLASS_PER_DAY

            for (let index = 0; index < subjectsCount; index++) {
                const subject = subjectsList[index];
                let assigned = false;

                // Try each day and each session until we find a match
                for (let dIdx = 0; dIdx < totalWorkingDays && !assigned; dIdx++) {
                    const examDay = workingDays[dIdx];
                    const dateStr = examDay.date;
                    const dayKey = `${classId}-${dateStr}`;

                    // --- CALENDAR CONSTRAINT CHECK ---
                    // 1. Check for class-specific override
                    const classOverride = classExMap.get(dayKey);
                    if (classOverride) {
                        const isClassWorking = (classOverride === DayType.WORKING || classOverride === DayType.SPECIAL_WORKING);
                        if (!isClassWorking) continue; // Skip if class-specific holiday
                    } else {
                        // 2. Use global working status (already filtered in workingDays, but let's be explicit)
                        if (!examDay.isWorking) continue;
                    }

                    // 🔒 HARD RULE: 1 subject per class per day (unless explicitly permitted more)
                    const currentDayCount = classDayCount.get(dayKey) ?? 0;
                    if (currentDayCount >= MAX_EXAMS_PER_CLASS_PER_DAY) continue;

                    // Sessions: Morning is always tried first.
                    // Afternoon is only tried if maximizeGaps=true OR Morning already occupied (collision).
                    const sessionConfigs = [
                        { start: "09:00", end: "12:00", name: "Morning" },
                        ...(dto.maximizeGaps ? [{ start: "13:30", end: "16:30", name: "Afternoon" }] : []),
                    ];

                    for (let sIdx = 0; sIdx < sessionConfigs.length && !assigned; sIdx++) {
                        const session = sessionConfigs[sIdx];
                        const startTime = session.start;
                        const duration = DEFAULT_DURATION;

                        // --- FIX 1: Same class collision ---
                        if (this.scheduler.checkClassCollision({ classId, date: dateStr, startTime, sessionMap: classSessionMap })) continue;

                        let assignedRoomId: number | null = null;
                        let assignedRoomName: string | null = null;

                        if (dto.autoAssignRooms) {
                            const sectionId = (item.sectionIds && item.sectionIds.length === 1) ? item.sectionIds[0] : undefined;
                            const templateKey = `${classId}-${sectionId ?? 'none'}`;
                            const isLab = subject.type === 'LAB';

                            const resolution = this.resolveRoomForSession({
                                classId,
                                sectionId,
                                isLab,
                                templateMap,
                                availableRooms,
                                roomState,
                                roomUsageCount,
                                classDayRoom,
                                dayKey,
                                dateStr,
                                startTime,
                                duration,
                                dbExams,
                                classStudentCounts,
                                effectiveStudentCount
                            });

                            if (resolution.error) {
                                // If template room is required but missing from pool, we must fail this session
                                continue;
                            }

                            assignedRoomId = resolution.roomId;
                            assignedRoomName = resolution.roomName;
                        }
                        else {
                            // If auto-assign is off, we just assign the time slot
                            assignedRoomId = null;
                        }

                        if (!dto.autoAssignRooms || assignedRoomId) {
                            // Found a valid slot!
                            classSessionMap.add(`${classId}-${dateStr}-${startTime}`);
                            classDayCount.set(dayKey, (classDayCount.get(dayKey) ?? 0) + 1);

                            // Only update daily preference if NOT using a template (prevents drift reinforcement)
                            const sectionId = (item.sectionIds && item.sectionIds.length === 1) ? item.sectionIds[0] : undefined;
                            const templateKey = `${classId}-${sectionId ?? 'none'}`;
                            if (assignedRoomId && !templateMap.has(templateKey)) {
                                classDayRoom.set(dayKey, assignedRoomId);
                            }

                            generatedSchedules.push({
                                classId,
                                subjectId: subject.id,
                                subjectName: subject.name,
                                subjectCode: subject.code,
                                examDate: dateStr,
                                startTime,
                                endTime: session.end,
                                duration,
                                maxMarks: 100,
                                passingMarks: 33,
                                theoryMarks: dto.theoryMarks,
                                practicalMarks: dto.practicalMarks,
                                session: session.name,
                                ...(assignedRoomId ? { roomId: assignedRoomId, roomName: assignedRoomName } : {}),
                            });
                            assigned = true;
                        }
                    }
                }

                if (!assigned) {
                    failures.push(this.scheduler.getFailureReason(
                        classId,
                        subject.name,
                        `No valid slot found — not enough working days, or room capacity exceeded. Classes allowed: ${MAX_EXAMS_PER_CLASS_PER_DAY}/day, working days: ${totalWorkingDays}.`
                    ));
                }
            }
        }

        // --- FIX 10: Fail Loudly ---
        return {
            success: failures.length === 0,
            schedules: generatedSchedules,
            failures: failures.length > 0 ? failures : undefined
        };
    }
    async clearRoomTemplates(schoolId: number, academicYearId: number, examId: number) {
        return (this.prisma as any).examRoomTemplate.deleteMany({
            where: { schoolId, academicYearId, examId }
        });
    }

    private async initRoomTemplates(
        schoolId: number,
        academicYearId: number,
        dto: any,
        availableRooms: any[],
        classStudentCounts: Map<number, number>
    ): Promise<Map<string, number>> {
        const existingTemplates = await (this.prisma as any).examRoomTemplate.findMany({
            where: { examId: dto.examId }
        });

        const templateMap = new Map<string, number>();
        existingTemplates.forEach(t => {
            const key = `${t.classId}-${t.sectionId ?? 'none'}`;
            templateMap.set(key, t.roomId);
        });

        if (templateMap.size === 0 && dto.autoAssignRooms) {
            const distinctClasses: { classId: number; sectionId?: number; studentCount: number }[] = [];
            for (const item of dto.scheduleItems) {
                const studentCount = classStudentCounts.get(item.classId) || 0;
                const sectionId = (item.sectionIds && item.sectionIds.length === 1) ? item.sectionIds[0] : undefined;
                distinctClasses.push({ classId: item.classId, sectionId, studentCount });
            }

            const newTemplate = this.scheduler.generateRoomTemplate({
                classes: distinctClasses,
                rooms: availableRooms.map(r => ({ id: r.id, name: r.name, capacity: r.capacity, benches: r.benches, studentsPerBench: r.studentsPerBench }))
            });

            const templateData = Array.from(newTemplate.entries()).map(([key, roomId]) => {
                const [classId, sectionIdStr] = key.split('-');
                return {
                    schoolId,
                    academicYearId,
                    examId: dto.examId,
                    classId: parseInt(classId),
                    sectionId: sectionIdStr === 'none' ? null : parseInt(sectionIdStr),
                    roomId
                };
            });

            if (templateData.length > 0) {
                await (this.prisma as any).examRoomTemplate.createMany({ data: templateData });
                newTemplate.forEach((v, k) => templateMap.set(k, v));
            }
        }
        return templateMap;
    }

    /**
     * BENCH-AWARE EFFECTIVE CAPACITY
     * Core exam seating rule: same class ≠ same bench.
     * - First class in empty room → benches × 1 (1 student per bench)
     * - Additional DIFFERENT class → benches × studentsPerBench - usedSeats
     * - Same class already in room → 0 (rejected)
     */
    private getEffectiveCapacity(
        room: { benches: number; studentsPerBench: number },
        state: { usedSeats: number; classesInRoom: Set<number> },
        incomingClassId: number
    ): number {
        const classesInRoom = state.classesInRoom;

        // Same class already seated → NEVER share a bench
        if (classesInRoom.has(incomingClassId)) {
            return 0;
        }

        if (classesInRoom.size === 0) {
            // First class → 1 student per bench only
            return room.benches;
        }

        // Mixed classes → can use all seats minus what's already used
        const totalSeats = room.benches * room.studentsPerBench;
        return totalSeats - state.usedSeats;
    }

    private resolveRoomForSession(params: {
        classId: number;
        sectionId?: number;
        isLab: boolean;
        templateMap: Map<string, number>;
        availableRooms: any[];
        roomState: Map<string, any>;
        roomUsageCount: Map<number, number>;
        classDayRoom: Map<string, number>;
        dayKey: string;
        dateStr: string;
        startTime: string;
        duration: number;
        dbExams: any[];
        classStudentCounts: Map<number, number>;
        effectiveStudentCount: number;
    }): { roomId: number | null; roomName: string | null; error?: boolean } {
        const { classId, sectionId, isLab, templateMap, availableRooms, roomState, roomUsageCount, classDayRoom, dayKey, dateStr, startTime, duration, dbExams, classStudentCounts, effectiveStudentCount } = params;
        const templateKey = `${classId}-${sectionId ?? 'none'}`;
        const templatedRoomId = isLab ? null : templateMap.get(templateKey);

        let assignedRoomId: number | null = null;
        let assignedRoomName: string | null = null;

        if (templatedRoomId) {
            const room = availableRooms.find(r => r.id === templatedRoomId);
            if (!room) return { roomId: null, roomName: null, error: true }; // Hard fail if template room missing from pool

            const roomSlotKey = `${room.id}-${dateStr}-${startTime}`;
            this.ensureRoomState(room, roomSlotKey, roomState, dbExams, classStudentCounts, dateStr, startTime, duration);

            const state = roomState.get(roomSlotKey)!;
            const effectiveCap = this.getEffectiveCapacity(room, state, classId);

            if (effectiveCap >= effectiveStudentCount) {
                assignedRoomId = room.id;
                assignedRoomName = room.name;
                state.usedSeats += effectiveStudentCount;
                state.classesInRoom.add(classId);
                state.batchCount++;
                if (state.batchCount > 1) state.mode = 'MULTI';
                roomUsageCount.set(room.id, (roomUsageCount.get(room.id) ?? 0) + 1);
            }
        }

        if (!assignedRoomId) {
            const preferredRoomId = classDayRoom.get(dayKey);
            const roomScores = availableRooms.map(room => {
                const roomSlotKey = `${room.id}-${dateStr}-${startTime}`;
                const overlaps = this.getRoomOverlaps(room.id, dateStr, startTime, duration, dbExams);
                let dbUsed = 0;
                overlaps.forEach(o => dbUsed += Math.max(classStudentCounts.get(o.classId) || 0, 1));

                const score = this.scheduler.calculateRoomScore({
                    room: { id: room.id, name: room.name, capacity: room.capacity, benches: room.benches, studentsPerBench: room.studentsPerBench },
                    usageCount: roomUsageCount.get(room.id) ?? 0,
                    preferredRoomId,
                    studentCount: effectiveStudentCount,
                    existingOverlapCount: overlaps.length
                });

                return { room, score, roomSlotKey, dbUsed, overlapsCount: overlaps.length };
            });

            roomScores.sort((a, b) => b.score - a.score);

            for (const { room, roomSlotKey, dbUsed, overlapsCount } of roomScores) {
                if (!roomState.has(roomSlotKey)) {
                    const dbClassIds = this.getRoomOverlaps(room.id, dateStr, startTime, duration, dbExams).map(o => o.classId);
                    roomState.set(roomSlotKey, {
                        usedSeats: dbUsed,
                        batchCount: 0,
                        dbCount: overlapsCount,
                        mode: overlapsCount > 0 ? 'MULTI' : 'SINGLE',
                        classesInRoom: new Set<number>(dbClassIds)
                    });
                }
                const state = roomState.get(roomSlotKey)!;
                const effectiveCap = this.getEffectiveCapacity(room, state, classId);

                if (effectiveCap >= effectiveStudentCount) {
                    assignedRoomId = room.id;
                    assignedRoomName = room.name;
                    state.usedSeats += effectiveStudentCount;
                    state.classesInRoom.add(classId);
                    state.batchCount++;
                    if (state.batchCount > 1) state.mode = 'MULTI';
                    roomUsageCount.set(room.id, (roomUsageCount.get(room.id) ?? 0) + 1);
                    break;
                }
            }
        }

        return { roomId: assignedRoomId, roomName: assignedRoomName };
    }

    private ensureRoomState(room: any, roomSlotKey: string, roomState: Map<string, any>, dbExams: any[], classStudentCounts: Map<number, number>, date: string, startTime: string, duration: number) {
        if (!roomState.has(roomSlotKey)) {
            const overlaps = this.getRoomOverlaps(room.id, date, startTime, duration, dbExams);
            let dbUsed = 0;
            const dbClassIds: number[] = [];
            overlaps.forEach(o => {
                dbUsed += Math.max(classStudentCounts.get(o.classId) || 0, 1);
                dbClassIds.push(o.classId);
            });
            roomState.set(roomSlotKey, {
                usedSeats: dbUsed,
                batchCount: 0,
                dbCount: overlaps.length,
                mode: overlaps.length > 0 ? 'MULTI' : 'SINGLE',
                classesInRoom: new Set<number>(dbClassIds)
            });
        }
    }

    private getRoomOverlaps(roomId: number, date: string, startTime: string, duration: number, dbExams: any[]) {
        const timeToMin = (t: string) => {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };
        return dbExams.filter(s => {
            if (s.roomId !== roomId || s.examDate?.toISOString().split('T')[0] !== date) return false;
            const s1Start = timeToMin(s.startTime || "00:00");
            const s1End = s1Start + (s.duration || 180);
            const s2Start = timeToMin(startTime);
            const s2End = s2Start + duration;
            return s1Start < s2End && s2Start < s1End;
        });
    }
}
