import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateTimetableEntryDto } from '../dto/create-timetable-entry.dto';
import { TimetableCacheService } from './cache.service';
import { TimetableInventoryService } from './inventory.service';

@Injectable()
export class TimetableEntryService {
    private readonly logger = new Logger(TimetableEntryService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly cacheService: TimetableCacheService,
        private readonly inventoryService: TimetableInventoryService
    ) { }

    async createEntry(schoolId: number, academicYearId: number, dto: CreateTimetableEntryDto) {
        const { groupId, teacherId, roomId, subjectId, timeSlotId, day } = dto;

        // 1. Ownership & N+1 Optimization: Fetch related entities once
        const [group, teacher, room, subject] = await Promise.all([
            this.prisma.academicGroup.findFirst({ where: { id: groupId, schoolId } }),
            teacherId ? this.prisma.teacherProfile.findFirst({ where: { id: teacherId, schoolId } }) : null,
            roomId ? this.prisma.room.findFirst({ where: { id: roomId, schoolId } }) : null,
            subjectId ? this.prisma.subject.findFirst({ where: { id: subjectId, schoolId } }) : null
        ]);

        if (!group) throw new NotFoundException('Group not found or unauthorized');
        if (teacherId && !teacher) throw new NotFoundException('Teacher not found or unauthorized');
        if (roomId && !room) throw new NotFoundException('Room not found or unauthorized');
        if (subjectId && !subject) throw new NotFoundException('Subject not found or unauthorized');

        // 2. Transactional Create (Atomic Conflict Check + Create)
        const entry = await this.prisma.$transaction(async (tx) => {
            // Re-check conflicts inside transaction to prevent race conditions
            const groupConflict = await tx.timetableEntry.findFirst({
                where: { schoolId, academicYearId, day, timeSlotId, groupId },
            });
            if (groupConflict) throw new ConflictException('Group already has a session in this slot');

            if (teacherId) {
                const teacherConflict = await tx.timetableEntry.findFirst({
                    where: { schoolId, academicYearId, day, timeSlotId, teacherId },
                });
                if (teacherConflict) throw new ConflictException('Teacher is already busy in this slot');
            }

            if (roomId) {
                const roomConflict = await tx.timetableEntry.findFirst({
                    where: { schoolId, academicYearId, day, timeSlotId, roomId },
                });
                if (roomConflict) throw new ConflictException('Room is already occupied in this slot');
            }

            return tx.timetableEntry.create({
                data: {
                    schoolId,
                    academicYearId,
                    ...dto,
                },
            });
        });

        await this.cacheService.invalidateAnalyticsCache(schoolId, academicYearId);
        return entry;
    }

    async deleteEntry(schoolId: number, id: number) {
        const entry = await this.prisma.timetableEntry.findUnique({
            where: { id_schoolId: { id, schoolId } },
            select: { academicYearId: true }
        });

        if (!entry) throw new NotFoundException('Timetable entry not found');

        const result = await this.prisma.timetableEntry.delete({
            where: { id_schoolId: { id, schoolId } },
        });

        await this.cacheService.invalidateAnalyticsCache(schoolId, entry.academicYearId);
        return result;
    }

    async copyTimetableStructure(schoolId: number, fromYearId: number, toYearId: number) {
        const sourcePeriods = await this.prisma.timePeriod.findMany({
            where: { schoolId, academicYearId: fromYearId },
            include: { timeSlots: true },
        });

        if (sourcePeriods.length === 0) {
            throw new BadRequestException('Source academic year has no timetable structure to copy');
        }

        const result = await this.prisma.$transaction(async (tx) => {
            // Delete existing structure in target year (optional, but safer for "copy over")
            await tx.timePeriod.deleteMany({ where: { schoolId, academicYearId: toYearId } });

            for (const period of sourcePeriods) {
                const newPeriod = await tx.timePeriod.create({
                    data: {
                        schoolId,
                        academicYearId: toYearId,
                        name: period.name,
                        startTime: period.startTime,
                        endTime: period.endTime,
                        type: period.type,
                        days: period.days,
                        scheduleId: period.scheduleId,
                    },
                });

                if (period.timeSlots.length > 0) {
                    await tx.timeSlot.createMany({
                        data: period.timeSlots.map(slot => ({
                            schoolId,
                            academicYearId: toYearId,
                            day: slot.day,
                            startTime: slot.startTime,
                            endTime: slot.endTime,
                            isBreak: slot.isBreak,
                            periodId: newPeriod.id,
                            scheduleId: slot.scheduleId,
                        })),
                    });
                }
            }
            return { count: sourcePeriods.length };
        });

        await this.cacheService.invalidateAnalyticsCache(schoolId, toYearId);
        return { message: `Successfully copied ${result.count} periods and structure.` };
    }
}
