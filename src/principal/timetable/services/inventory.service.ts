import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateTimetableEntryDto } from '../dto/create-timetable-entry.dto';
import { DayOfWeek } from '@prisma/client';

@Injectable()
export class TimetableInventoryService {
    constructor(private readonly prisma: PrismaService) { }

    async findFreeTeachers(
        schoolId: number,
        academicYearId: number,
        day: DayOfWeek,
        timeSlotId: number,
        subjectId?: number,
    ) {
        // 1. Get all teachers for this school
        const allTeachers = await this.prisma.teacherProfile.findMany({
            where: { schoolId, isActive: true },
            select: {
                id: true,
                user: { select: { name: true } },
                subjectAssignments: {
                    select: { subjectId: true },
                },
            },
        });

        // 2. Get busy teachers for this slot
        const busyTeacherIds = await this.prisma.timetableEntry.findMany({
            where: {
                schoolId,
                academicYearId,
                day,
                timeSlotId,
            },
            select: { teacherId: true },
        }).then(entries => entries.map(e => e.teacherId).filter(id => id !== null));

        // 3. Filter free ones
        let freeTeachers = allTeachers.filter(t => !busyTeacherIds.includes(t.id));

        // 4. Optional: Filter by subject expertise
        if (subjectId) {
            freeTeachers = freeTeachers.filter(t =>
                t.subjectAssignments.some(sa => sa.subjectId === subjectId),
            );
        }

        return freeTeachers.map(t => ({
            id: t.id,
            name: t.user.name,
        }));
    }

    async findFreeRooms(
        schoolId: number,
        academicYearId: number,
        day: DayOfWeek,
        timeSlotId: number,
    ) {
        const allRooms = await this.prisma.room.findMany({
            where: { schoolId, status: 'ACTIVE' },
            select: { id: true, name: true },
        });

        const busyRoomIds = await this.prisma.timetableEntry.findMany({
            where: {
                schoolId,
                academicYearId,
                day,
                timeSlotId,
            },
            select: { roomId: true },
        }).then(entries => entries.map(e => e.roomId).filter(id => id !== null));

        return allRooms.filter(r => !busyRoomIds.includes(r.id));
    }

    async checkAvailability(
        schoolId: number,
        academicYearId: number,
        dto: CreateTimetableEntryDto,
    ): Promise<{ status: 'OK' | 'CONFLICT'; message?: string }> {
        const { day, timeSlotId, teacherId, roomId, groupId } = dto;

        // 1. Ownership Validation (Security)
        if (teacherId) {
            const teacher = await this.prisma.teacherProfile.findFirst({ where: { id: teacherId, schoolId } });
            if (!teacher) throw new NotFoundException('Teacher not found or belongs to another school');
        }
        if (roomId) {
            const room = await this.prisma.room.findFirst({ where: { id: roomId, schoolId } });
            if (!room) throw new NotFoundException('Room not found or belongs to another school');
        }
        const group = await this.prisma.academicGroup.findFirst({ where: { id: groupId, schoolId } });
        if (!group) throw new NotFoundException('Group not found or belongs to another school');

        // 2. Conflict Checks
        const groupConflict = await this.prisma.timetableEntry.findFirst({
            where: { schoolId, academicYearId, day, timeSlotId, groupId },
        });
        if (groupConflict) return { status: 'CONFLICT', message: 'Group already has a session in this slot' };

        if (teacherId) {
            const teacherConflict = await this.prisma.timetableEntry.findFirst({
                where: { schoolId, academicYearId, day, timeSlotId, teacherId },
            });
            if (teacherConflict) return { status: 'CONFLICT', message: 'Teacher is already busy in this slot' };
        }

        if (roomId) {
            const roomConflict = await this.prisma.timetableEntry.findFirst({
                where: { schoolId, academicYearId, day, timeSlotId, roomId },
            });
            if (roomConflict) return { status: 'CONFLICT', message: 'Room is already occupied in this slot' };
        }

        return { status: 'OK' };
    }

    async validateTimeOverlap(
        schoolId: number,
        academicYearId: number,
        scheduleId: number | null | undefined,
        startTime: string,
        endTime: string,
        excludePeriodId?: number
    ) {
        const start = this.parseTime(startTime);
        const end = this.parseTime(endTime);

        if (start >= end) {
            throw new ConflictException('Start time must be before end time');
        }

        const existingPeriods = await this.prisma.timePeriod.findMany({
            where: {
                schoolId,
                academicYearId,
                scheduleId,
                id: excludePeriodId ? { not: excludePeriodId } : undefined
            },
            select: { id: true, startTime: true, endTime: true, name: true }
        });

        for (const p of existingPeriods) {
            const pStart = this.parseTime(p.startTime);
            const pEnd = this.parseTime(p.endTime);

            // Overlap logic: (StartA < EndB) and (EndA > StartB)
            if (start < pEnd && end > pStart) {
                throw new ConflictException(`Time overlaps with existing period: ${p.name} (${p.startTime}-${p.endTime})`);
            }
        }
    }

    private parseTime(time: string): number {
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + minutes;
    }
}
