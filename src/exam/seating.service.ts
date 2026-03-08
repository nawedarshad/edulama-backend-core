import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsArray } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';

// DTOs
export class CreateSeatingArrangementDto {
    @IsNumber()
    @IsNotEmpty()
    studentId: number;

    @IsNumber()
    @IsNotEmpty()
    roomId: number;

    @IsString()
    @IsOptional()
    seatNumber?: string;

    @IsString()
    @IsOptional()
    rollNumber?: string;

    @IsBoolean()
    @IsOptional()
    requiresScribe?: boolean;

    @IsBoolean()
    @IsOptional()
    requiresExtraTime?: boolean;

    @IsString()
    @IsOptional()
    specialNotes?: string;
}

export class GenerateSeatingDto {
    @IsNumber()
    @IsNotEmpty()
    scheduleId: number;

    @IsArray()
    @IsNumber({}, { each: true })
    @IsNotEmpty()
    roomIds: number[]; // Rooms to use for seating

    @IsNumber()
    @IsOptional()
    studentsPerRoom?: number; // Optional: distribute evenly or use room capacity

    @IsBoolean()
    @IsOptional()
    randomize?: boolean; // Randomize seat allocation
}

export class GenerateSessionSeatingDto {
    @IsNumber()
    @IsNotEmpty()
    roomId: number;

    @IsString()
    @IsNotEmpty()
    date: string;

    @IsString()
    @IsNotEmpty()
    startTime: string;

    @IsBoolean()
    @IsOptional()
    randomize?: boolean;
}

@Injectable()
export class SeatingService {
    constructor(private readonly prisma: PrismaService) { }

    // ============================================================
    // MANUAL SEATING
    // ============================================================

    async createSeating(
        schoolId: number,
        academicYearId: number,
        examId: number,
        scheduleId: number,
        dto: CreateSeatingArrangementDto
    ) {
        // Verify schedule exists
        const schedule = await this.prisma.examSchedule.findFirst({
            where: { id: scheduleId, schoolId, academicYearId, examId },
        });

        if (!schedule) {
            throw new NotFoundException('Schedule not found');
        }

        // Check for duplicate
        const existing = await this.prisma.seatingArrangement.findFirst({
            where: { scheduleId, studentId: dto.studentId },
        });

        if (existing) {
            throw new BadRequestException('Student already has seating for this exam');
        }

        return this.prisma.seatingArrangement.create({
            data: {
                schoolId,
                academicYearId,
                examId,
                scheduleId,
                ...dto,
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
                room: { select: { name: true, code: true } },
            },
        });
    }

    // ============================================================
    // AUTO SEATING GENERATION
    // ============================================================

    async generateSeating(schoolId: number, academicYearId: number, examId: number, dto: GenerateSeatingDto) {
        const { scheduleId, roomIds, studentsPerRoom, randomize } = dto;

        // Get schedule with class/section info
        const schedule = await this.prisma.examSchedule.findFirst({
            where: { id: scheduleId, schoolId, academicYearId, examId },
            include: {
                class: true,
                section: true,
                room: true,
            },
        });

        if (!schedule) {
            throw new NotFoundException('Schedule not found');
        }

        if (!schedule.examDate || !schedule.startTime) {
            throw new BadRequestException('Schedule must have a date and time to generate seating');
        }

        // Use the room assigned to this schedule if roomIds is empty
        const effectiveRoomIds = roomIds.length > 0 ? roomIds : (schedule.roomId ? [schedule.roomId] : []);
        if (effectiveRoomIds.length === 0) {
            throw new BadRequestException('No rooms selected or assigned to this schedule');
        }

        // Just delegate to session-based generation for each room
        const results: any[] = [];
        for (const roomId of effectiveRoomIds) {
            const result = await this.generateSessionSeating(schoolId, academicYearId, examId, {
                roomId,
                date: schedule.examDate.toISOString(),
                startTime: schedule.startTime,
                randomize
            });
            results.push(result);
        }

        return {
            message: 'Seating generated successfully',
            roomResults: results
        };
    }

    async generateSessionSeating(schoolId: number, academicYearId: number, examId: number, dto: GenerateSessionSeatingDto) {
        const { roomId, date, startTime, randomize } = dto;
        const examDate = new Date(date);

        // 1. Get Room Info (Benches!)
        const room = await this.prisma.room.findFirst({
            where: { id: roomId, schoolId },
            select: { id: true, name: true, benches: true, studentsPerBench: true, capacity: true }
        });

        if (!room) throw new NotFoundException('Room not found');

        // 2. Get all schedules in this room slot
        // Note: we might need to handle duration overlap, but usually we use discrete slots
        const schedules = await this.prisma.examSchedule.findMany({
            where: {
                schoolId,
                academicYearId,
                roomId,
                examDate: {
                    gte: new Date(examDate.setHours(0, 0, 0, 0)),
                    lt: new Date(examDate.setHours(23, 59, 59, 999))
                },
                startTime
            },
            include: {
                class: true,
                section: true
            }
        });

        if (schedules.length === 0) {
            throw new BadRequestException('No exam schedules found for this room slot');
        }

        // 3. Gather all students involved
        const classIds = Array.from(new Set(schedules.map(s => s.classId)));

        // Group students by class
        const studentsByClass = new Map<number, any[]>();
        for (const schedule of schedules) {
            const students = await this.prisma.studentProfile.findMany({
                where: {
                    schoolId,
                    classId: schedule.classId,
                    ...(schedule.sectionId && { sectionId: schedule.sectionId }),
                    isActive: true
                },
                select: { id: true, fullName: true, rollNo: true, admissionNo: true },
                orderBy: randomize ? undefined : { rollNo: 'asc' }
            });

            const existing = studentsByClass.get(schedule.classId) || [];
            studentsByClass.set(schedule.classId, [...existing, ...students]);
        }

        // Randomize within each class if requested
        if (randomize) {
            for (const [classId, students] of studentsByClass.entries()) {
                studentsByClass.set(classId, this.shuffleArray(students));
            }
        }

        // 4. Bench-Aware Allocation
        // The rule: Same class != same bench.
        // We alternate students from different classes across benches.

        const seatingData: any[] = [];
        const classes = Array.from(studentsByClass.keys());
        const totalBenches = room.benches || Math.ceil((room.capacity || 30) / (room.studentsPerBench || 2));
        const studentsPerBench = room.studentsPerBench || 2;

        // Flatten classes for alternating distribution
        // Logic: Round-robin through classes to fill positions on benches

        for (let b = 1; b <= totalBenches; b++) {
            const benchClassIds = new Set<number>();

            for (let p = 1; p <= studentsPerBench; p++) {
                // Determine which class to pick from
                // We try to pick a class that hasn't been placed on this bench yet
                let classIdToPick: number | null = null;

                for (let i = 0; i < classes.length; i++) {
                    const candidateIndex = (b + p + i - 3) % classes.length;
                    const candidateClassId = classes[candidateIndex];

                    if (!benchClassIds.has(candidateClassId)) {
                        const students = studentsByClass.get(candidateClassId);
                        if (students && students.length > 0) {
                            classIdToPick = candidateClassId;
                            break;
                        }
                    }
                }

                if (classIdToPick !== null) {
                    const students = studentsByClass.get(classIdToPick)!;
                    const student = students.shift()!;
                    const schedule = schedules.find(s => s.classId === classIdToPick);

                    seatingData.push({
                        schoolId,
                        academicYearId,
                        examId,
                        scheduleId: schedule!.id,
                        studentId: student.id,
                        roomId: room.id,
                        benchNumber: b,
                        seatPosition: p,
                        seatNumber: `B${b}-P${p}`,
                        rollNumber: student.rollNo || student.admissionNo,
                    });

                    benchClassIds.add(classIdToPick);
                }
            }
        }

        // 5. Cleanup & Save
        const scheduleIds = schedules.map(s => s.id);
        await this.prisma.seatingArrangement.deleteMany({
            where: { scheduleId: { in: scheduleIds }, roomId: room.id }
        });

        const created = await this.prisma.seatingArrangement.createMany({
            data: seatingData
        });

        return {
            roomId: room.id,
            roomName: room.name,
            totalStudents: seatingData.length,
            seatsCreated: created.count,
            benchesUsed: totalBenches
        };
    }

    // ============================================================
    // QUERY
    // ============================================================

    async findBySchedule(schoolId: number, academicYearId: number, scheduleId: number) {
        return this.prisma.seatingArrangement.findMany({
            where: { schoolId, academicYearId, scheduleId },
            include: {
                student: {
                    select: {
                        id: true,
                        fullName: true,
                        admissionNo: true,
                        rollNo: true,
                        class: { select: { name: true } }
                    },
                },
                room: { select: { id: true, name: true, code: true, benches: true, studentsPerBench: true } },
            },
            orderBy: [{ roomId: 'asc' }, { benchNumber: 'asc' }, { seatPosition: 'asc' }],
        });
    }

    async findBySession(schoolId: number, academicYearId: number, examId: number, date: string, startTime: string) {
        const examDate = new Date(date);
        return this.prisma.seatingArrangement.findMany({
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
            include: {
                student: {
                    select: {
                        id: true,
                        fullName: true,
                        admissionNo: true,
                        rollNo: true,
                        classId: true,
                        class: { select: { name: true } }
                    },
                },
                room: { select: { id: true, name: true, code: true, benches: true, studentsPerBench: true } },
                schedule: {
                    include: {
                        subject: { select: { name: true } }
                    }
                }
            },
            orderBy: [{ roomId: 'asc' }, { benchNumber: 'asc' }, { seatPosition: 'asc' }],
        });
    }

    async findByRoom(schoolId: number, academicYearId: number, scheduleId: number, roomId: number) {
        return this.prisma.seatingArrangement.findMany({
            where: { schoolId, academicYearId, scheduleId, roomId },
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
            orderBy: { seatNumber: 'asc' },
        });
    }

    async delete(schoolId: number, academicYearId: number, id: number) {
        const seating = await this.prisma.seatingArrangement.findFirst({
            where: { id, schoolId, academicYearId },
        });

        if (!seating) {
            throw new NotFoundException('Seating arrangement not found');
        }

        await this.prisma.seatingArrangement.delete({ where: { id } });
        return { message: 'Seating deleted successfully' };
    }

    // ============================================================
    // HELPERS
    // ============================================================

    private shuffleArray<T>(array: T[]): T[] {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }
}
