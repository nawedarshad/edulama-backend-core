import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateTimePeriodDto } from '../dto/create-time-period.dto';
import { TimetableCacheService } from './cache.service';
import { TimetableInventoryService } from './inventory.service';
import { DayOfWeek } from '@prisma/client';

@Injectable()
export class TimetablePeriodService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly cacheService: TimetableCacheService,
        private readonly inventoryService: TimetableInventoryService
    ) { }

    async createTimePeriod(schoolId: number, academicYearId: number, dto: CreateTimePeriodDto) {
        // 1. Validate Overlap
        await this.inventoryService.validateTimeOverlap(
            schoolId,
            academicYearId,
            dto.scheduleId,
            dto.startTime,
            dto.endTime
        );

        // 2. Transactional Create
        const period = await this.prisma.$transaction(async (tx) => {
            const newPeriod = await tx.timePeriod.create({
                data: {
                    schoolId,
                    academicYearId,
                    ...dto,
                },
            });

            if (dto.days && dto.days.length > 0) {
                await this.syncTimeSlotsInternal(tx, schoolId, academicYearId, newPeriod.id, dto.days, dto.startTime, dto.endTime, dto.scheduleId);
            }
            return newPeriod;
        });

        await this.cacheService.invalidateAnalyticsCache(schoolId, academicYearId);
        return period;
    }

    async findAllTimePeriods(schoolId: number, academicYearId: number) {
        return this.prisma.timePeriod.findMany({
            where: { schoolId, academicYearId },
            include: { timeSlots: true },
            orderBy: { startTime: 'asc' },
        });
    }

    async updateTimePeriod(schoolId: number, academicYearId: number, id: number, dto: CreateTimePeriodDto) {
        // 1. Ownership & Existence Check
        const existing = await this.prisma.timePeriod.findUnique({
            where: { id_schoolId: { id, schoolId } }
        });
        if (!existing) throw new NotFoundException('Time period not found');

        // 2. Validate Overlap
        await this.inventoryService.validateTimeOverlap(
            schoolId,
            academicYearId,
            dto.scheduleId,
            dto.startTime,
            dto.endTime,
            id
        );

        // 3. Transactional Update
        const period = await this.prisma.$transaction(async (tx) => {
            const updated = await tx.timePeriod.update({
                where: { id_schoolId: { id, schoolId } },
                data: dto,
            });

            if (dto.days) {
                await this.syncTimeSlotsInternal(tx, schoolId, academicYearId, id, dto.days, dto.startTime, dto.endTime, dto.scheduleId);
            }
            return updated;
        });

        await this.cacheService.invalidateAnalyticsCache(schoolId, academicYearId);
        return period;
    }

    async deleteTimePeriod(schoolId: number, id: number) {
        const period = await this.prisma.timePeriod.findUnique({
            where: { id_schoolId: { id, schoolId } },
            select: { academicYearId: true }
        });
        if (!period) throw new NotFoundException('Time period not found');

        const result = await this.prisma.timePeriod.delete({
            where: { id_schoolId: { id, schoolId } },
        });

        await this.cacheService.invalidateAnalyticsCache(schoolId, period.academicYearId);
        return result;
    }

    async syncTimeSlots(schoolId: number, academicYearId: number, periodId: number, days: DayOfWeek[]) {
        const period = await this.prisma.timePeriod.findUnique({
            where: { id_schoolId: { id: periodId, schoolId } }
        });
        if (!period) throw new NotFoundException('Period not found');

        await this.prisma.$transaction(async (tx) => {
            await this.syncTimeSlotsInternal(tx, schoolId, academicYearId, periodId, days, period.startTime, period.endTime, period.scheduleId);
        });

        await this.cacheService.invalidateAnalyticsCache(schoolId, academicYearId);
    }

    private async syncTimeSlotsInternal(
        tx: any,
        schoolId: number,
        academicYearId: number,
        periodId: number,
        days: DayOfWeek[],
        startTime: string,
        endTime: string,
        scheduleId: number | null | undefined
    ) {
        // 1. Fetch existing slots for this period
        const existingSlots = await tx.timeSlot.findMany({
            where: { schoolId, periodId },
        });

        const existingDays = existingSlots.map(s => s.day);
        const daysToRemove = existingDays.filter(d => !days.includes(d));
        const daysToUpdate = existingDays.filter(d => days.includes(d));
        const daysToAdd = days.filter(d => !existingDays.includes(d));

        // 2. Delete slots for days that are no longer selected
        if (daysToRemove.length > 0) {
            await tx.timeSlot.deleteMany({
                where: {
                    schoolId,
                    periodId,
                    day: { in: daysToRemove }
                },
            });
        }

        // 3. Update existing slots (Preserves IDs for linked TimetableEntries)
        if (daysToUpdate.length > 0) {
            await tx.timeSlot.updateMany({
                where: {
                    schoolId,
                    periodId,
                    day: { in: daysToUpdate }
                },
                data: {
                    startTime,
                    endTime,
                    scheduleId
                }
            });
        }

        // 4. Create new slots for newly selected days
        if (daysToAdd.length > 0) {
            await tx.timeSlot.createMany({
                data: daysToAdd.map(day => ({
                    schoolId,
                    academicYearId,
                    periodId,
                    day,
                    startTime,
                    endTime,
                    scheduleId
                })),
            });
        }
    }
}
