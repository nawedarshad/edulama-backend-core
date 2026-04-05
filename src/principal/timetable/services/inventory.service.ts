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
        // 1. Get all teachers
        const allTeachers = await this.prisma.teacherProfile.findMany({
            where: { schoolId, isActive: true },
            select: {
                id: true,
                empCode: true,
                personalInfo: { select: { fullName: true } },
                user: { select: { name: true } },
                subjectAssignments: { select: { subjectId: true } },
            },
        });

        // 2. Identify busy teachers (including those in spans)
        // We find entries that either:
        // a) Start exactly at this slot
        // b) Started before but span into this slot
        // Simplified approach: find all entries for the group/day and check their span
        // But for global teacher availability, we check all entries for that day
        const entriesOnDay = await this.prisma.timetableEntry.findMany({
            where: { schoolId, academicYearId, day },
            select: {
                teacherId: true,
                timeSlotId: true,
                durationSlots: true,
                teachers: { select: { teacherId: true } }
            }
        });

        const busyTeacherIds = new Set<number>();
        const targetSlot = await this.prisma.timeSlot.findUnique({ where: { id_schoolId: { id: timeSlotId, schoolId } } });
        if (!targetSlot) return [];

        for (const entry of entriesOnDay) {
            const entrySlot = await this.prisma.timeSlot.findUnique({ where: { id_schoolId: { id: entry.timeSlotId, schoolId } } });
            if (!entrySlot) continue;

            const isBusyInSlot = await this.isSlotInEntrySpan(schoolId, academicYearId, day, entry.timeSlotId, entry.durationSlots, timeSlotId);
            
            if (isBusyInSlot) {
                if (entry.teacherId) busyTeacherIds.add(entry.teacherId);
                entry.teachers.forEach(t => busyTeacherIds.add(t.teacherId));
            }
        }

        // 3. Filter free ones
        let freeTeachers = allTeachers.filter(t => !busyTeacherIds.has(t.id));

        if (subjectId) {
            freeTeachers = freeTeachers.filter(t =>
                t.subjectAssignments.some(sa => sa.subjectId === subjectId),
            );
        }

        return freeTeachers;
    }

    async findFreeRooms(
        schoolId: number,
        academicYearId: number,
        day: DayOfWeek,
        timeSlotId: number,
    ) {
        const allRooms = await this.prisma.room.findMany({
            where: { schoolId, status: 'ACTIVE' },
            select: { id: true, name: true, code: true },
        });

        const entriesOnDay = await this.prisma.timetableEntry.findMany({
            where: { schoolId, academicYearId, day },
            select: {
                roomId: true,
                timeSlotId: true,
                durationSlots: true,
                rooms: { select: { roomId: true } }
            }
        });

        const busyRoomIds = new Set<number>();

        for (const entry of entriesOnDay) {
            const isBusyInSlot = await this.isSlotInEntrySpan(schoolId, academicYearId, day, entry.timeSlotId, entry.durationSlots, timeSlotId);
            if (isBusyInSlot) {
                if (entry.roomId) busyRoomIds.add(entry.roomId);
                entry.rooms.forEach(r => busyRoomIds.add(r.roomId));
            }
        }

        return allRooms.filter(r => !busyRoomIds.has(r.id));
    }

    private async isSlotInEntrySpan(schoolId: number, academicYearId: number, day: DayOfWeek, entryStartSlotId: number, duration: number, targetSlotId: number): Promise<boolean> {
        if (entryStartSlotId === targetSlotId) return true;
        if (duration <= 1) return false;

        const consecutive = await this.getConsecutiveSlots(schoolId, academicYearId, day, entryStartSlotId, duration);
        return consecutive.some(s => s.id === targetSlotId);
    }

    async checkAvailability(
        schoolId: number,
        academicYearId: number,
        dto: CreateTimetableEntryDto,
    ): Promise<{ status: 'OK' | 'CONFLICT'; message?: string }> {
        const { day, timeSlotId, teacherId, teacherIds = [], roomId, roomIds = [], groupId, subjectId, durationSlots = 1 } = dto;

        // 1. Ownership & Entity Validation
        const allTeacherIds = [...new Set([teacherId, ...teacherIds].filter((id): id is number => !!id))];
        const allRoomIds = [...new Set([roomId, ...roomIds].filter((id): id is number => !!id))];

        if (allTeacherIds.length > 0) {
            const teachers = await this.prisma.teacherProfile.count({ where: { id: { in: allTeacherIds }, schoolId } });
            if (teachers !== allTeacherIds.length) throw new NotFoundException('Some teachers not found or unauthorized');
        }
        if (allRoomIds.length > 0) {
            const rooms = await this.prisma.room.count({ where: { id: { in: allRoomIds }, schoolId } });
            if (rooms !== allRoomIds.length) throw new NotFoundException('Some rooms not found or unauthorized');
        }
        if (subjectId) {
            const subjectCount = await this.prisma.subject.count({ where: { id: subjectId, schoolId } });
            if (subjectCount === 0) throw new NotFoundException('Subject not found or unauthorized');
        }
        const group = await this.prisma.academicGroup.findFirst({ where: { id: groupId, schoolId } });
        if (!group) throw new NotFoundException('Group not found or unauthorized');

        // 2. Working Day Validation (Merge School-wide & Class-specific)
        const groupData = await this.prisma.academicGroup.findUnique({
            where: { id_schoolId: { id: groupId, schoolId } },
            select: { classId: true }
        });

        const patterns = await this.prisma.workingPattern.findMany({
            where: { 
                schoolId, 
                academicYearId, 
                dayOfWeek: day as any,
                OR: [
                    { classId: null },
                    ...(groupData?.classId ? [{ classId: groupData.classId }] : [])
                ]
            }
        });

        const classPattern = patterns.find(p => p.classId !== null);
        const schoolPattern = patterns.find(p => p.classId === null);
        const isWorking = (classPattern || schoolPattern)?.isWorking ?? false;

        if (!isWorking) {
            return { status: 'CONFLICT', message: `${day} is marked as a holiday for this class and cannot have scheduled sessions.` };
        }

        // 3. Multi-Slot Validation (Blocks)
        const relevantSlots = await this.getConsecutiveSlots(schoolId, academicYearId, day, timeSlotId, durationSlots);
        if (relevantSlots.length < durationSlots) {
            return { status: 'CONFLICT', message: `Cannot fit a ${durationSlots}-slot block starting at this time.` };
        }

        const slotIds = relevantSlots.map(s => s.id);

        // 3. Deep Conflict Detection
        for (const slotId of slotIds) {
            // Group check
            const groupConflict = await this.prisma.timetableEntry.findFirst({
                where: { schoolId, academicYearId, day, timeSlotId: slotId, groupId },
            });
            if (groupConflict) return { status: 'CONFLICT', message: `Group is already busy in one of the requested slots` };

            // Teacher check
            if (allTeacherIds.length > 0) {
                const teacherConflict = await this.prisma.timetableEntry.findFirst({
                    where: {
                        schoolId,
                        academicYearId,
                        day,
                        timeSlotId: slotId,
                        OR: [
                            { teacherId: { in: allTeacherIds } },
                            { teachers: { some: { teacherId: { in: allTeacherIds } } } }
                        ]
                    },
                });
                if (teacherConflict) return { status: 'CONFLICT', message: `One or more teachers are busy in one of the requested slots` };
            }

            // Room check
            if (allRoomIds.length > 0) {
                const roomConflict = await this.prisma.timetableEntry.findFirst({
                    where: {
                        schoolId,
                        academicYearId,
                        day,
                        timeSlotId: slotId,
                        OR: [
                            { roomId: { in: allRoomIds } },
                            { rooms: { some: { roomId: { in: allRoomIds } } } }
                        ]
                    },
                });
                if (roomConflict) return { status: 'CONFLICT', message: `One or more rooms are occupied in one of the requested slots` };
            }
        }

        return { status: 'OK' };
    }

    async getConsecutiveSlots(schoolId: number, academicYearId: number, day: DayOfWeek, startTimeSlotId: number, duration: number) {
        const startSlot = await this.prisma.timeSlot.findUnique({ where: { id_schoolId: { id: startTimeSlotId, schoolId } } });
        if (!startSlot) return [];

        const allSlots = await this.prisma.timeSlot.findMany({
            where: { schoolId, academicYearId, day, scheduleId: startSlot.scheduleId },
            orderBy: { startTime: 'asc' }
        });

        const startIndex = allSlots.findIndex(s => s.id === startTimeSlotId);
        if (startIndex === -1) return [];

        return allSlots.slice(startIndex, startIndex + duration);
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
