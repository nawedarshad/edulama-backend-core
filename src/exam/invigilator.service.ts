import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';

// DTOs
export class CreateInvigilatorDto {
    @IsNumber()
    @IsNotEmpty()
    teacherId: number;

    @IsNumber()
    @IsNotEmpty()
    roomId: number;

    @IsBoolean()
    @IsOptional()
    isChiefInvigilator?: boolean;

    @IsString()
    @IsOptional()
    specialInstructions?: string;
}

export class AssignInvigilatorsDto {
    @IsNumber()
    @IsNotEmpty()
    scheduleId: number;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateInvigilatorDto)
    @IsNotEmpty()
    assignments: CreateInvigilatorDto[];
}

export class GenerateSessionInvigilatorsDto {
    @IsString()
    @IsNotEmpty()
    date: string;

    @IsString()
    @IsNotEmpty()
    startTime: string;

    @IsNumber()
    @IsNotEmpty()
    teachersPerRoom: number;
}

@Injectable()
export class InvigilatorService {
    constructor(private readonly prisma: PrismaService) { }

    // ============================================================
    // INVIGILATOR ASSIGNMENT
    // ============================================================

    async assignInvigilator(
        schoolId: number,
        academicYearId: number,
        examId: number,
        scheduleId: number,
        dto: CreateInvigilatorDto
    ) {
        // Verify schedule exists
        const schedule = await this.prisma.examSchedule.findFirst({
            where: { id: scheduleId, schoolId, academicYearId, examId },
        });

        if (!schedule) {
            throw new NotFoundException('Schedule not found');
        }

        // Check for duplicate
        const existing = await this.prisma.invigilatorAssignment.findFirst({
            where: {
                scheduleId,
                teacherId: dto.teacherId,
                roomId: dto.roomId,
            },
        });

        if (existing) {
            throw new BadRequestException('Teacher already assigned to this room');
        }

        return this.prisma.invigilatorAssignment.create({
            data: {
                schoolId,
                academicYearId,
                examId,
                scheduleId,
                ...dto,
            },
            include: {
                teacher: {
                    include: {
                        user: { select: { name: true } },
                    },
                },
                room: { select: { name: true, code: true } },
            },
        });
    }

    async assignBulk(
        schoolId: number,
        academicYearId: number,
        examId: number,
        dto: AssignInvigilatorsDto
    ) {
        const { scheduleId, assignments } = dto;

        // Clear existing assignments for this schedule
        await this.prisma.invigilatorAssignment.deleteMany({
            where: { scheduleId },
        });

        // Create new assignments
        const created = await this.prisma.$transaction(
            assignments.map(assignment =>
                this.prisma.invigilatorAssignment.create({
                    data: {
                        schoolId,
                        academicYearId,
                        examId,
                        scheduleId,
                        ...assignment,
                    },
                })
            )
        );

        return { count: created.length, assignments: created };
    }

    // ============================================================
    // AUTO-ASSIGN INVIGILATORS
    // ============================================================

    async autoAssign(schoolId: number, academicYearId: number, examId: number, scheduleId: number) {
        // Get schedule details
        const schedule = await this.prisma.examSchedule.findFirst({
            where: { id: scheduleId, schoolId, academicYearId, examId },
            include: {
                seatingArrangements: {
                    select: { roomId: true },
                    distinct: ['roomId'],
                },
            },
        });

        if (!schedule) {
            throw new NotFoundException('Schedule not found');
        }

        const roomIds = schedule.seatingArrangements.map(s => s.roomId);

        if (roomIds.length === 0) {
            throw new BadRequestException('No seating arrangements found. Generate seating first.');
        }

        // Get available teachers (not teaching at this time)
        // For simplicity, get all active teachers
        const teachers = await this.prisma.teacherProfile.findMany({
            where: { schoolId, isActive: true },
            select: { id: true },
            take: roomIds.length * 2, // 2 invigilators per room
        });

        if (teachers.length < roomIds.length) {
            throw new BadRequestException('Not enough teachers available for invigilation');
        }

        // Assign teachers to rooms
        const assignments: any[] = [];
        let teacherIndex = 0;

        for (const roomId of roomIds) {
            // Chief invigilator
            if (teacherIndex < teachers.length) {
                assignments.push({
                    schoolId,
                    academicYearId,
                    examId,
                    scheduleId,
                    teacherId: teachers[teacherIndex].id,
                    roomId,
                    isChiefInvigilator: true,
                });
                teacherIndex++;
            }

            // Assistant invigilator
            if (teacherIndex < teachers.length) {
                assignments.push({
                    schoolId,
                    academicYearId,
                    examId,
                    scheduleId,
                    teacherId: teachers[teacherIndex].id,
                    roomId,
                    isChiefInvigilator: false,
                });
                teacherIndex++;
            }
        }

        // Clear existing and create new
        await this.prisma.invigilatorAssignment.deleteMany({
            where: { scheduleId },
        });

        const created = await this.prisma.invigilatorAssignment.createMany({
            data: assignments,
        });

        return {
            message: 'Invigilators assigned successfully',
            count: created.count,
            roomsAssigned: roomIds.length,
        };
    }

    async generateSessionInvigilators(schoolId: number, academicYearId: number, examId: number, dto: GenerateSessionInvigilatorsDto) {
        const { date, startTime, teachersPerRoom } = dto;
        const examDate = new Date(date);

        // 1. Find all rooms with seating in this session
        const seatingArrangements = await this.prisma.seatingArrangement.findMany({
            where: {
                schoolId,
                academicYearId,
                examId,
                schedule: {
                    examDate: {
                        gte: new Date(examDate.setHours(0, 0, 0, 0)),
                        lt: new Date(examDate.setHours(23, 59, 59, 999))
                    },
                    startTime
                }
            },
            select: { roomId: true },
            distinct: ['roomId']
        });

        const roomIds = seatingArrangements.map(s => s.roomId);

        if (roomIds.length === 0) {
            throw new BadRequestException('No seating arrangements found for this session. Generate seating first.');
        }

        // 2. Get available teachers
        const teachers = await this.prisma.teacherProfile.findMany({
            where: { schoolId, isActive: true },
            select: { id: true }
        });

        if (teachers.length < roomIds.length) {
            throw new BadRequestException(`Not enough teachers. Have ${teachers.length}, need at least ${roomIds.length}.`);
        }

        // 3. Shuffle teachers for random allocation
        const shuffledTeachers = this.shuffleArray(teachers);

        // 4. Distribution logic
        const assignments: any[] = [];
        let teacherIndex = 0;

        // Get all schedule IDs in this session to link the assignments
        // Since assignments are traditionally linked to a schedule, but now rooms are shared,
        // we'll link them to the primary schedule of that room in that session.
        const sessionSchedules = await this.prisma.examSchedule.findMany({
            where: {
                schoolId,
                academicYearId,
                examId,
                examDate: {
                    gte: new Date(examDate.setHours(0, 0, 0, 0)),
                    lt: new Date(examDate.setHours(23, 59, 59, 999))
                },
                startTime
            },
            select: { id: true, roomId: true }
        });

        for (const roomId of roomIds) {
            // Find one schedule associated with this room in this session to act as anchor
            // In Prisma schema, InvigilatorAssignment belongs to a Schedule.
            const anchorSchedule = sessionSchedules.find(s => s.roomId === roomId);
            if (!anchorSchedule) continue;

            const roomScheduleIds = sessionSchedules.filter(s => s.roomId === roomId).map(s => s.id);

            // Clear existing for all schedules in this room/session
            await this.prisma.invigilatorAssignment.deleteMany({
                where: { scheduleId: { in: roomScheduleIds }, roomId }
            });

            for (let i = 0; i < teachersPerRoom; i++) {
                if (teacherIndex >= shuffledTeachers.length) {
                    // Start reusing teachers if we run out? No, the user might prefer an error or gap.
                    // For now, we stop or loop. Let's loop but warn?
                    // Re-shuffle and reset or just break.
                    break;
                }

                assignments.push({
                    schoolId,
                    academicYearId,
                    examId,
                    scheduleId: anchorSchedule.id,
                    teacherId: shuffledTeachers[teacherIndex].id,
                    roomId,
                    isChiefInvigilator: i === 0, // First teacher is chief
                });

                teacherIndex++;
            }
        }

        const created = await this.prisma.invigilatorAssignment.createMany({
            data: assignments
        });

        return {
            count: created.count,
            roomsAssigned: roomIds.length,
            teachersUsed: teacherIndex
        };
    }

    async findBySession(schoolId: number, academicYearId: number, examId: number, date: string, startTime: string) {
        const examDate = new Date(date);
        const dayStart = new Date(examDate.setHours(0, 0, 0, 0));
        const dayEnd = new Date(examDate.setHours(23, 59, 59, 999));

        const assignments = await this.prisma.invigilatorAssignment.findMany({
            where: {
                schoolId,
                academicYearId,
                examId,
                schedule: {
                    examDate: {
                        gte: dayStart,
                        lt: dayEnd
                    },
                    startTime
                }
            },
            include: {
                teacher: {
                    include: {
                        user: { select: { name: true } },
                    },
                },
                room: { select: { id: true, name: true, code: true } },
                schedule: {
                    select: {
                        subject: { select: { name: true } },
                        class: { select: { name: true } }
                    }
                }
            },
            orderBy: [{ roomId: 'asc' }, { isChiefInvigilator: 'desc' }],
        });

        // For each room, fetch all classes that have exams there in this session
        const uniqueRoomIds = [...new Set(assignments.map(a => a.roomId))];

        const sessionSchedules = await this.prisma.examSchedule.findMany({
            where: {
                schoolId,
                academicYearId,
                examId,
                examDate: {
                    gte: dayStart,
                    lt: dayEnd
                },
                startTime,
                roomId: { in: uniqueRoomIds }
            },
            include: { class: { select: { name: true } } }
        });

        const roomClassesMap: Record<number, string[]> = {};
        sessionSchedules.forEach(s => {
            const rid = s.roomId;
            if (rid === null) return;
            if (!roomClassesMap[rid]) roomClassesMap[rid] = [];
            if (!roomClassesMap[rid].includes(s.class.name)) {
                roomClassesMap[rid].push(s.class.name);
            }
        });

        return assignments.map(a => ({
            ...a,
            roomClasses: roomClassesMap[a.roomId] || []
        }));
    }

    // ============================================================
    // QUERY
    // ============================================================

    async findBySchedule(schoolId: number, academicYearId: number, scheduleId: number) {
        return this.prisma.invigilatorAssignment.findMany({
            where: { schoolId, academicYearId, scheduleId },
            include: {
                teacher: {
                    include: {
                        user: { select: { name: true } },
                    },
                },
                room: { select: { name: true, code: true } },
            },
            orderBy: [{ roomId: 'asc' }, { isChiefInvigilator: 'desc' }],
        });
    }

    async findByTeacher(schoolId: number, academicYearId: number, teacherId: number, examId?: number) {
        return this.prisma.invigilatorAssignment.findMany({
            where: {
                schoolId,
                academicYearId,
                teacherId,
                ...(examId && { examId }),
            },
            include: {
                exam: { select: { name: true, code: true } },
                schedule: {
                    select: {
                        examDate: true,
                        startTime: true,
                        endTime: true,
                        subject: { select: { name: true } },
                        class: { select: { name: true } },
                    },
                },
                room: { select: { name: true, code: true } },
            },
            orderBy: { schedule: { examDate: 'asc' } },
        });
    }

    async delete(schoolId: number, academicYearId: number, id: number) {
        const assignment = await this.prisma.invigilatorAssignment.findFirst({
            where: { id, schoolId, academicYearId },
        });

        if (!assignment) {
            throw new NotFoundException('Invigilator assignment not found');
        }

        await this.prisma.invigilatorAssignment.delete({ where: { id } });
        return { message: 'Assignment deleted successfully' };
    }

    private shuffleArray(array: any[]) {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
    }
}
