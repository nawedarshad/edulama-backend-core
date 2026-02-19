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
}
