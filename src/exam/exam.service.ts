import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional, IsEnum, IsNumber, IsDate, IsBoolean, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import { ExamType, ExamStatus, ExamCategory, RoomType } from '@prisma/client';

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

    @IsNumber()
    @IsOptional()
    theoryMarks?: number;

    @IsNumber()
    @IsOptional()
    practicalMarks?: number;

    @IsBoolean()
    @IsOptional()
    autoAssignRooms?: boolean;
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

    @IsNumber()
    @IsOptional()
    theoryMarks?: number;

    @IsNumber()
    @IsOptional()
    practicalMarks?: number;

    @IsBoolean()
    @IsOptional()
    autoAssignRooms?: boolean;
}

import { CalendarService } from '../principal/calendar/calendar.service';
import { DayType } from '@prisma/client';

export class AutoScheduleDto {
    @IsNotEmpty()
    startDate: string | Date;

    @IsNotEmpty()
    endDate: string | Date;

    @IsArray()
    @IsNotEmpty()
    scheduleItems: { classId: number; subjectIds: number[] }[];

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

        const { classIds, theoryMarks, practicalMarks, autoAssignRooms, ...rest } = dto;

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

        const { theoryMarks, practicalMarks, autoAssignRooms, ...rest } = dto;

        return this.prisma.exam.update({
            where: { id },
            data: rest,
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
            s => s.examDate && new Date(s.examDate) < new Date()
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

        // Pre-fetch rooms if auto-assign is requested
        let availableRooms: { id: number; name: string; code: string | null; capacity: number | null; roomType: RoomType }[] = [];
        // Track room bookings within THIS generated schedule to avoid intra-batch conflicts
        // Key: `${roomId}-${date}-${startTime}`
        const roomBookings = new Set<string>();

        if (dto.autoAssignRooms) {
            const roomWhere: any = { schoolId, status: 'ACTIVE' };
            if (dto.roomIds) {
                roomWhere.id = { in: dto.roomIds };
            }
            availableRooms = await this.prisma.room.findMany({
                where: roomWhere,
                select: { id: true, name: true, code: true, capacity: true, roomType: true },
            });

            // Sort: CLASSROOM first, then by capacity (smallest first)
            availableRooms.sort((a, b) => {
                if (a.roomType === 'CLASSROOM' && b.roomType !== 'CLASSROOM') return -1;
                if (a.roomType !== 'CLASSROOM' && b.roomType === 'CLASSROOM') return 1;
                return (a.capacity ?? 0) - (b.capacity ?? 0);
            });
        }

        // Track remaining capacity for rooms per slot
        // Key: `${roomId}-${date}-${startTime}`
        const roomCapacityTracker = new Map<string, number>();

        for (const item of dto.scheduleItems) {
            const classId = item.classId;

            // Get subjects for this class
            let classSubjects = await this.prisma.subject.findMany({
                where: {
                    id: { in: item.subjectIds }
                },
                select: { id: true, name: true, code: true }
            });

            // Get student count for this class
            let studentCount = 0;
            if (dto.autoAssignRooms) {
                studentCount = await this.prisma.studentProfile.count({
                    where: { schoolId, classId, isActive: true },
                });
            }

            // A. Jumble Subjects
            if (dto.jumbleSubjects) {
                for (let i = classSubjects.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [classSubjects[i], classSubjects[j]] = [classSubjects[j], classSubjects[i]];
                }
            }

            // B. Allocation Logic
            for (let index = 0; index < classSubjects.length; index++) {
                const subject = classSubjects[index];
                let dayIndex = 0;

                if (dto.maximizeGaps && classSubjects.length > 1 && totalWorkingDays >= classSubjects.length) {
                    dayIndex = Math.floor((index * (totalWorkingDays - 1)) / (classSubjects.length - 1));
                } else {
                    dayIndex = index;
                }

                if (dayIndex < totalWorkingDays) {
                    const examDay = workingDays[dayIndex];
                    const startTime = '09:00';

                    // C. Auto Room Assignment (Refined: Empty Room Priority)
                    let assignedRoomId: number | null = null;
                    let assignedRoomName: string | null = null;

                    if (dto.autoAssignRooms && availableRooms.length > 0) {
                        const slotKeyBase = `${examDay.date}-${startTime}`;

                        // Pass 1: Look for a completely empty room (following the preference sort)
                        for (const room of availableRooms) {
                            const slotKey = `${room.id}-${slotKeyBase}`;

                            // Initialize tracker if needed
                            if (!roomCapacityTracker.has(slotKey)) {
                                const existingExams = await this.prisma.examSchedule.findMany({
                                    where: {
                                        schoolId,
                                        roomId: room.id,
                                        examDate: new Date(examDay.date),
                                        startTime,
                                    },
                                    select: { classId: true }
                                });

                                let usedCapacity = 0;
                                for (const ex of existingExams) {
                                    const exCount = await this.prisma.studentProfile.count({
                                        where: { schoolId, classId: ex.classId, isActive: true }
                                    });
                                    usedCapacity += exCount;
                                }
                                roomCapacityTracker.set(slotKey, (room.capacity ?? 0) - usedCapacity);
                            }

                            const remainingCapacity = roomCapacityTracker.get(slotKey) || 0;
                            const isTotallyEmpty = remainingCapacity === (room.capacity ?? 0);

                            if (isTotallyEmpty && remainingCapacity >= studentCount) {
                                assignedRoomId = room.id;
                                assignedRoomName = room.name;
                                roomCapacityTracker.set(slotKey, remainingCapacity - studentCount);
                                break;
                            }
                        }

                        // Pass 2: If no empty room found, look for ANY room with enough capacity
                        if (!assignedRoomId) {
                            for (const room of availableRooms) {
                                const slotKey = `${room.id}-${slotKeyBase}`;
                                const remainingCapacity = roomCapacityTracker.get(slotKey) || 0;

                                if (remainingCapacity >= studentCount) {
                                    assignedRoomId = room.id;
                                    assignedRoomName = room.name;
                                    roomCapacityTracker.set(slotKey, remainingCapacity - studentCount);
                                    break;
                                }
                            }
                        }
                    }

                    schedules.push({
                        classId,
                        subjectId: subject.id,
                        subjectName: subject.name,
                        subjectCode: subject.code,
                        examDate: examDay.date,
                        startTime,
                        endTime: '12:00',
                        duration: 180,
                        maxMarks: 100,
                        passingMarks: 33,
                        theoryMarks: dto.theoryMarks,
                        practicalMarks: dto.practicalMarks,
                        ...(assignedRoomId ? { roomId: assignedRoomId, roomName: assignedRoomName } : {}),
                    });
                }
            }
        }

        return schedules;
    }
}
