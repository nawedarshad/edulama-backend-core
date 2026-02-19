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
            },
        });

        if (!schedule) {
            throw new NotFoundException('Schedule not found');
        }

        // Get all students in the class/section
        const students = await this.prisma.studentProfile.findMany({
            where: {
                schoolId,
                academicYearId,
                classId: schedule.classId,
                ...(schedule.sectionId && { sectionId: schedule.sectionId }),
                isActive: true,
            },
            select: {
                id: true,
                fullName: true,
                admissionNo: true,
                rollNo: true,
            },
            orderBy: randomize ? undefined : { rollNo: 'asc' },
        });

        if (students.length === 0) {
            throw new BadRequestException('No students found for this class/section');
        }

        // Get room capacities
        const rooms = await this.prisma.room.findMany({
            where: { id: { in: roomIds }, schoolId },
            select: { id: true, name: true, capacity: true },
        });

        if (rooms.length === 0) {
            throw new BadRequestException('No valid rooms found');
        }

        // Randomize students if requested
        const studentList = randomize ? this.shuffleArray([...students]) : students;

        // Distribute students across rooms
        const seatingData: any[] = [];
        let studentIndex = 0;
        let seatCounter = 1;

        for (const room of rooms) {
            const roomCapacity = studentsPerRoom || room.capacity || 30;
            let seatsInRoom = 0;

            while (seatsInRoom < roomCapacity && studentIndex < studentList.length) {
                const student = studentList[studentIndex];
                seatingData.push({
                    schoolId,
                    academicYearId,
                    examId,
                    scheduleId,
                    studentId: student.id,
                    roomId: room.id,
                    seatNumber: `${room.name}-${seatCounter}`,
                    rollNumber: student.rollNo || student.admissionNo,
                });

                studentIndex++;
                seatsInRoom++;
                seatCounter++;
            }

            seatCounter = 1; // Reset for next room
        }

        // Clear existing seating for this schedule
        await this.prisma.seatingArrangement.deleteMany({
            where: { scheduleId },
        });

        // Bulk create seating
        const created = await this.prisma.seatingArrangement.createMany({
            data: seatingData,
        });

        return {
            message: 'Seating generated successfully',
            totalStudents: students.length,
            seatsCreated: created.count,
            roomsUsed: rooms.length,
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
                    },
                },
                room: { select: { name: true, code: true } },
            },
            orderBy: [{ roomId: 'asc' }, { seatNumber: 'asc' }],
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
