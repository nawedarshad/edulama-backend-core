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
                include: { teacher: { include: { user: true } }, room: true, subject: true, section: true }
            }),
            this.prisma.timetableEntry.findFirst({
                where: { id: dto.entryId2, schoolId, academicYearId },
                include: { teacher: { include: { user: true } }, room: true, subject: true, section: true }
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

        const checkConflict = async (teacherId: number, roomId: number | null, day: any, periodId: number, ignoreEntryId: number) => {
            const conflict = await this.prisma.timetableEntry.findFirst({
                where: {
                    schoolId,
                    academicYearId,
                    day,
                    periodId,
                    id: { not: ignoreEntryId }, // Ignore the entry likely being swapped OUT if it was there? No.
                    // When moving T1 to Slot 2, we must ensure T1 isn't ALREADY in Slot 2 in ANOTHER section.
                    OR: [
                        { teacherId },
                        { roomId: roomId ? roomId : undefined }
                    ]
                },
                include: { class: true, section: true }
            });

            if (conflict) {
                if (conflict.teacherId === teacherId) {
                    throw new ConflictException(`Teacher is busy in ${conflict.class.name}-${conflict.section.name} at the target time.`);
                }
                if (roomId && conflict.roomId === roomId) {
                    throw new ConflictException(`Room is occupied by ${conflict.class.name}-${conflict.section.name} at the target time.`);
                }
            }
        };

        // Validate Entry 1 moving to Slot 2
        // We ignore Entry 2 because Entry 2 is moving OUT of this slot.
        await checkConflict(entry1.teacherId, entry1.roomId, entry2.day, entry2.periodId, entry2.id);

        // Validate Entry 2 moving to Slot 1
        // We ignore Entry 1 because Entry 1 is moving OUT of this slot.
        await checkConflict(entry2.teacherId, entry2.roomId, entry1.day, entry1.periodId, entry1.id);

        // 4. Perform Swap
        await this.prisma.$transaction([
            this.prisma.timetableEntry.update({
                where: { id: entry1.id },
                data: { day: entry2.day, periodId: entry2.periodId, roomId: entry2.roomId }, // Swap Room too? Or keep Room? Usually dragging moves the allocation.
                // Logic: If I drag English (Room 101) to Math's slot, English keeps Room 101 or takes Math's room?
                // Standard UI behavior: Swap the entire slot content.
            }),
            this.prisma.timetableEntry.update({
                where: { id: entry2.id },
                data: { day: entry1.day, periodId: entry1.periodId, roomId: entry1.roomId },
            }),
        ]);

        return { message: 'Entries swapped successfully' };
    }

    async moveEntry(schoolId: number, academicYearId: number, dto: { entryId: number; targetDay: any; targetPeriodId: number }) {
        const entry = await this.prisma.timetableEntry.findFirst({
            where: { id: dto.entryId, schoolId, academicYearId },
            include: { teacher: { include: { user: true } }, class: true, section: true }
        });

        if (!entry) throw new NotFoundException('Entry not found');

        // 1. Lock Check
        if (entry.isLocked || entry.status === 'LOCKED') {
            throw new BadRequestException('Cannot move a locked entry.');
        }

        // 2. Section Conflict Check (Target slot occupied?)
        const sectionConflict = await this.prisma.timetableEntry.findFirst({
            where: {
                schoolId,
                academicYearId,
                sectionId: entry.sectionId,
                day: dto.targetDay,
                periodId: dto.targetPeriodId
            },
        });

        if (sectionConflict) {
            throw new ConflictException('The target slot is already occupied by another subject. Please swap instead.');
        }

        // 3. Teacher Conflict Check
        const teacherConflict = await this.prisma.timetableEntry.findFirst({
            where: {
                schoolId,
                academicYearId,
                day: dto.targetDay,
                periodId: dto.targetPeriodId,
                teacherId: entry.teacherId
            },
            include: { class: true, section: true }
        });

        if (teacherConflict) {
            throw new ConflictException(
                `Teacher ${entry.teacher.user.name} is already teaching ${teacherConflict.class.name}-${teacherConflict.section.name} at this time.`
            );
        }

        // 4. Room Conflict Check
        if (entry.roomId) {
            const roomConflict = await this.prisma.timetableEntry.findFirst({
                where: {
                    schoolId,
                    academicYearId,
                    day: dto.targetDay,
                    periodId: dto.targetPeriodId,
                    roomId: entry.roomId
                },
                include: { class: true, section: true }
            });

            if (roomConflict) {
                throw new ConflictException(
                    `The assigned room is already booked by ${roomConflict.class.name}-${roomConflict.section.name} at this time.`
                );
            }
        }

        // 5. Move
        await this.prisma.timetableEntry.update({
            where: { id: dto.entryId },
            data: { day: dto.targetDay, periodId: dto.targetPeriodId },
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

    async publishTimetable(schoolId: number, academicYearId: number, sectionId: number, userId: number) {
        // Update all entries that are NOT locked.
        // This ensures entries that were somehow left in DRAFT or modified are synced to PUBLISHED.
        const result = await this.prisma.timetableEntry.updateMany({
            where: {
                schoolId,
                academicYearId,
                sectionId,
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

    async lockTimetable(schoolId: number, academicYearId: number, sectionId: number) {
        await this.prisma.timetableEntry.updateMany({
            where: { schoolId, academicYearId, sectionId },
            data: { status: 'LOCKED' },
        });
        return { message: 'Timetable locked' };
    }

    async unlockTimetable(schoolId: number, academicYearId: number, sectionId: number) {
        await this.prisma.timetableEntry.updateMany({
            where: { schoolId, academicYearId, sectionId, status: 'LOCKED' },
            data: { status: 'PUBLISHED' },
        });
        return { message: 'Timetable unlocked' };
    }
}
