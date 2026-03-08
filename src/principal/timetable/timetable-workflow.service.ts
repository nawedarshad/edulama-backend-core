import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class TimetableWorkflowService {
    constructor(private readonly prisma: PrismaService) { }

    async swapEntries(schoolId: number, academicYearId: number, dto: { entryId1: number; entryId2: number }) {
        // 1. Fetch entries with relations
        const [entry1, entry2] = await Promise.all([
            this.prisma.timetableEntry.findFirst({
                where: { id: dto.entryId1, schoolId, academicYearId },
                include: { teacher: { include: { user: true } }, room: true, subject: true, group: { include: { class: true } } }
            }),
            this.prisma.timetableEntry.findFirst({
                where: { id: dto.entryId2, schoolId, academicYearId },
                include: { teacher: { include: { user: true } }, room: true, subject: true, group: { include: { class: true } } }
            }),
        ]);

        if (!entry1 || !entry2) throw new NotFoundException('One or both entries not found');

        // 2. Lock Validation
        if (entry1.isLocked || entry2.isLocked || entry1.status === 'LOCKED' || entry2.status === 'LOCKED') {
            throw new BadRequestException('Cannot swap locked entries or entries in a locked timetable.');
        }

        // 3. Conflict Validation (Cross-Check)
        // Check if Entry 1's teacher/room is free in Entry 2's slot (excluding Entry 2 itself if same section)
        // CAUTION: If swapping within same section, we don't need section check.
        // But we MUST check if Teacher1 is busy elsewhere in Slot 2.

        const checkConflict = async (teacherId: number, roomId: number | null, day: any, timeSlotId: number, ignoreEntryId: number) => {
            const conflict = await this.prisma.timetableEntry.findFirst({
                where: {
                    schoolId,
                    academicYearId,
                    day,
                    timeSlotId,
                    id: { not: ignoreEntryId }, // Ignore the entry likely being swapped OUT if it was there? No.
                    // When moving T1 to Slot 2, we must ensure T1 isn't ALREADY in Slot 2 in ANOTHER section.
                    OR: [
                        { teacherId },
                        { roomId: roomId ? roomId : undefined }
                    ]
                },
                include: { group: true }
            });

            if (conflict) {
                if (conflict.teacherId === teacherId) {
                    throw new ConflictException(`Teacher is busy in ${conflict.group.name} at the target time.`);
                }
                if (roomId && conflict.roomId === roomId) {
                    throw new ConflictException(`Room is occupied by ${conflict.group.name} at the target time.`);
                }
            }
        };

        // Validate Entry 1 moving to Slot 2
        // We ignore Entry 2 because Entry 2 is moving OUT of this slot.
        await checkConflict(entry1.teacherId!, entry1.roomId ?? null, entry2.day, entry2.timeSlotId, entry2.id);

        // Validate Entry 2 moving to Slot 1
        // We ignore Entry 1 because Entry 1 is moving OUT of this slot.
        await checkConflict(entry2.teacherId!, entry2.roomId ?? null, entry1.day, entry1.timeSlotId, entry1.id);

        // 4. Perform Swap
        await this.prisma.$transaction([
            this.prisma.timetableEntry.update({
                where: { id: entry1.id },
                data: { day: entry2.day, timeSlotId: entry2.timeSlotId, roomId: entry2.roomId },
            }),
            this.prisma.timetableEntry.update({
                where: { id: entry2.id },
                data: { day: entry1.day, timeSlotId: entry1.timeSlotId, roomId: entry1.roomId },
            }),
        ]);

        return { message: 'Entries swapped successfully' };
    }

    async moveEntry(schoolId: number, academicYearId: number, dto: { entryId: number; targetDay: any; targetTimeSlotId: number }) {
        const entry = await this.prisma.timetableEntry.findFirst({
            where: { id: dto.entryId, schoolId, academicYearId },
            include: { teacher: { include: { user: true } }, group: { include: { class: true } } }
        });

        if (!entry) throw new NotFoundException('Entry not found');

        // 1. Lock Check
        if (entry.isLocked || entry.status === 'LOCKED') {
            throw new BadRequestException('Cannot move a locked entry.');
        }

        // 0. TimeSlot Resolution (Graceful)
        let finalSlotId = dto.targetTimeSlotId;
        const initialSlot = await this.prisma.timeSlot.findUnique({
            where: { id: dto.targetTimeSlotId },
        });

        if (!initialSlot || initialSlot.schoolId !== schoolId || initialSlot.day !== dto.targetDay) {
            const periodId = initialSlot?.periodId || dto.targetTimeSlotId;
            const resolvedSlot = await this.prisma.timeSlot.findFirst({
                where: {
                    schoolId,
                    academicYearId,
                    day: dto.targetDay,
                    periodId,
                    scheduleId: entry.group.class?.scheduleId ?? undefined
                }
            });

            if (!resolvedSlot) {
                throw new BadRequestException(`Could not resolve target time slot for ${dto.targetDay}.`);
            }
            finalSlotId = resolvedSlot.id;
            dto.targetTimeSlotId = finalSlotId;
        }

        // 2. Group Conflict Check (Target slot occupied?)
        const groupConflict = await this.prisma.timetableEntry.findFirst({
            where: {
                schoolId,
                academicYearId,
                groupId: entry.groupId,
                day: dto.targetDay,
                timeSlotId: dto.targetTimeSlotId
            },
        });

        if (groupConflict) {
            throw new ConflictException('The target slot is already occupied by another subject. Please swap instead.');
        }

        if (!entry.teacher) {
            throw new BadRequestException('Teacher not assigned to this entry');
        }

        // 3. Teacher Conflict Check
        const teacherConflict = await this.prisma.timetableEntry.findFirst({
            where: {
                schoolId,
                academicYearId,
                day: dto.targetDay,
                timeSlotId: dto.targetTimeSlotId,
                teacherId: entry.teacherId
            },
            include: { group: true }
        });

        if (teacherConflict) {
            const teacherName = entry.teacher!.user?.name || 'Teacher';
            throw new ConflictException(
                `Teacher ${teacherName} is already teaching ${teacherConflict.group.name} at this time.`
            );
        }

        // 4. Room Conflict Check
        if (entry.roomId) {
            const roomConflict = await this.prisma.timetableEntry.findFirst({
                where: {
                    schoolId,
                    academicYearId,
                    day: dto.targetDay,
                    timeSlotId: dto.targetTimeSlotId,
                    roomId: entry.roomId
                },
                include: { group: true }
            });

            if (roomConflict) {
                throw new ConflictException(
                    `The assigned room is already booked by ${roomConflict.group.name} at this time.`
                );
            }
        }

        // 5. Move
        await this.prisma.timetableEntry.update({
            where: { id: dto.entryId },
            data: { day: dto.targetDay, timeSlotId: dto.targetTimeSlotId },
        });

        return { message: 'Entry moved successfully' };
    }

    async lockEntry(schoolId: number, entryId: number, isLocked: boolean) {
        await this.prisma.timetableEntry.updateMany({
            where: { id: entryId, schoolId },
            data: { isLocked },
        });
        return { message: `Entry ${isLocked ? 'locked' : 'unlocked'}` };
    }

    async publishTimetable(schoolId: number, academicYearId: number, groupId: number, userId: number) {
        // Update all entries that are NOT locked.
        // This ensures entries that were somehow left in DRAFT or modified are synced to PUBLISHED.
        const result = await this.prisma.timetableEntry.updateMany({
            where: {
                schoolId,
                academicYearId,
                groupId,
                status: { not: 'LOCKED' } // Changed from status: 'DRAFT'
            },
            data: { status: 'PUBLISHED', publishedAt: new Date(), publishedBy: userId },
        });
        return { message: `Timetable published. Updated ${result.count} entries.` };
    }

    async publishAllTimetable(schoolId: number, academicYearId: number, userId: number) {
        const result = await this.prisma.timetableEntry.updateMany({
            where: {
                schoolId,
                academicYearId,
                status: { not: 'LOCKED' }
            },
            data: { status: 'PUBLISHED', publishedAt: new Date(), publishedBy: userId },
        });
        return { message: `All timetables published. Updated ${result.count} entries.` };
    }

    async lockTimetable(schoolId: number, academicYearId: number, groupId: number) {
        await this.prisma.timetableEntry.updateMany({
            where: { schoolId, academicYearId, groupId },
            data: { status: 'LOCKED' },
        });
        return { message: 'Timetable locked' };
    }

    async unlockTimetable(schoolId: number, academicYearId: number, groupId: number) {
        await this.prisma.timetableEntry.updateMany({
            where: { schoolId, academicYearId, groupId, status: 'LOCKED' },
            data: { status: 'PUBLISHED' },
        });
        return { message: 'Timetable unlocked' };
    }
}
