import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { DayOfWeek } from '@prisma/client';
import { CreateTimePeriodDto } from './dto/create-time-period.dto';
import { CreateTimetableEntryDto } from './dto/create-timetable-entry.dto';

// Modular Services
import { TimetableAnalyticsService } from './services/analytics.service';
import { TimetableInventoryService } from './services/inventory.service';
import { TimetablePeriodService } from './services/period.service';
import { TimetableEntryService } from './services/entry.service';
import { TimetableContextService } from './services/context.service';

@Injectable()
export class TimetableService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly analytics: TimetableAnalyticsService,
        private readonly inventory: TimetableInventoryService,
        private readonly periods: TimetablePeriodService,
        private readonly entries: TimetableEntryService,
        private readonly context: TimetableContextService,
    ) { }

    // ----------------------------------------------------------------
    // HELPER: Year Lock & Validation
    // ----------------------------------------------------------------
    async ensureAcademicYear(schoolId: number, academicYearId: number): Promise<number> {
        if (academicYearId) return academicYearId;
        const activeYear = await this.prisma.academicYear.findFirst({
            where: { schoolId, status: 'ACTIVE' },
        });
        if (!activeYear) {
            throw new BadRequestException("No active academic year found. Configuration required.");
        }
        return activeYear.id;
    }

    private async checkYearLock(schoolId: number, academicYearId: number) {
        const year = await this.prisma.academicYear.findFirst({
            where: { id: academicYearId, schoolId },
        });
        if (year && (year.status === 'CLOSED' || year.status === 'ARCHIVED')) {
            throw new BadRequestException('Cannot modify timetable for a closed or archived academic year.');
        }
    }

    // ----------------------------------------------------------------
    // PERIODS & SLOTS
    // ----------------------------------------------------------------
    async createTimePeriod(schoolId: number, academicYearId: number, dto: CreateTimePeriodDto) {
        const resolvedYearId = await this.ensureAcademicYear(schoolId, academicYearId);
        await this.checkYearLock(schoolId, resolvedYearId);
        return this.periods.createTimePeriod(schoolId, resolvedYearId, dto);
    }

    async findAllTimePeriods(schoolId: number, academicYearId: number) {
        const resolvedYearId = await this.ensureAcademicYear(schoolId, academicYearId);
        return this.periods.findAllTimePeriods(schoolId, resolvedYearId);
    }

    async updateTimePeriod(schoolId: number, academicYearId: number, id: number, dto: CreateTimePeriodDto) {
        const resolvedYearId = await this.ensureAcademicYear(schoolId, academicYearId);
        await this.checkYearLock(schoolId, resolvedYearId);
        return this.periods.updateTimePeriod(schoolId, resolvedYearId, id, dto);
    }

    async deleteTimePeriod(schoolId: number, id: number) {
        const period = await this.prisma.timePeriod.findUnique({
            where: { id_schoolId: { id, schoolId } }
        });
        if (period) await this.checkYearLock(schoolId, period.academicYearId);
        return this.periods.deleteTimePeriod(schoolId, id);
    }

    async syncTimeSlots(schoolId: number, academicYearId: number, periodId: number, days: DayOfWeek[]) {
        const resolvedYearId = await this.ensureAcademicYear(schoolId, academicYearId);
        await this.checkYearLock(schoolId, resolvedYearId);
        return this.periods.syncTimeSlots(schoolId, resolvedYearId, periodId, days);
    }

    // ----------------------------------------------------------------
    // ENTRIES
    // ----------------------------------------------------------------
    async createEntry(schoolId: number, academicYearId: number, dto: CreateTimetableEntryDto, userId?: number) {
        const resolvedYearId = await this.ensureAcademicYear(schoolId, academicYearId);
        await this.checkYearLock(schoolId, resolvedYearId);
        return this.entries.createEntry(schoolId, resolvedYearId, dto, userId);
    }

    async deleteEntry(schoolId: number, id: number, userId?: number) {
        const entry = await this.prisma.timetableEntry.findUnique({
            where: { id_schoolId: { id, schoolId } }
        });
        if (entry) await this.checkYearLock(schoolId, entry.academicYearId);
        return this.entries.deleteEntry(schoolId, id, userId);
    }

    async copyTimetableStructure(schoolId: number, fromYearId: number, toYearId: number, userId?: number) {
        await this.checkYearLock(schoolId, toYearId);
        return this.entries.copyTimetableStructure(schoolId, fromYearId, toYearId, userId);
    }

    // ----------------------------------------------------------------
    // AVAILABILITY & INVENTORY
    // ----------------------------------------------------------------
    async findFreeTeachers(schoolId: number, academicYearId: number, day: DayOfWeek, timeSlotId: number, subjectId?: number) {
        const resolvedYearId = await this.ensureAcademicYear(schoolId, academicYearId);
        return this.inventory.findFreeTeachers(schoolId, resolvedYearId, day, timeSlotId, subjectId);
    }

    async findFreeRooms(schoolId: number, academicYearId: number, day: DayOfWeek, timeSlotId: number) {
        const resolvedYearId = await this.ensureAcademicYear(schoolId, academicYearId);
        return this.inventory.findFreeRooms(schoolId, resolvedYearId, day, timeSlotId);
    }

    async checkAvailability(schoolId: number, academicYearId: number, dto: CreateTimetableEntryDto) {
        const resolvedYearId = await this.ensureAcademicYear(schoolId, academicYearId);
        return this.inventory.checkAvailability(schoolId, resolvedYearId, dto);
    }

    // ----------------------------------------------------------------
    // CONTEXT & UI DATA
    // ----------------------------------------------------------------
    async getTimetableForGroup(schoolId: number, academicYearId: number, groupId: number) {
        const resolvedYearId = await this.ensureAcademicYear(schoolId, academicYearId);
        return this.context.getTimetableForGroup(schoolId, resolvedYearId, groupId);
    }

    async getTimetableForRoom(schoolId: number, academicYearId: number, roomId: number) {
        const resolvedYearId = await this.ensureAcademicYear(schoolId, academicYearId);
        return this.context.getTimetableForRoom(schoolId, resolvedYearId, roomId);
    }

    async getTimetableForTeacher(schoolId: number, academicYearId: number, teacherId: number) {
        const resolvedYearId = await this.ensureAcademicYear(schoolId, academicYearId);
        return this.context.getTimetableForTeacher(schoolId, resolvedYearId, teacherId);
    }

    async getTimetableContext(schoolId: number, academicYearId: number, groupId: number, modules: string[] = []) {
        const resolvedYearId = await this.ensureAcademicYear(schoolId, academicYearId);
        return this.context.getTimetableContext(schoolId, resolvedYearId, groupId, modules);
    }

    // ----------------------------------------------------------------
    // ANALYTICS
    // ----------------------------------------------------------------
    async getAnalyticsData(schoolId: number, academicYearId: number) {
        const resolvedYearId = await this.ensureAcademicYear(schoolId, academicYearId);
        return this.analytics.getAnalyticsData(schoolId, resolvedYearId);
    }

    async getComprehensiveAnalytics(schoolId: number, academicYearId: number) {
        const resolvedYearId = await this.ensureAcademicYear(schoolId, academicYearId);
        return this.analytics.getComprehensiveAnalytics(schoolId, resolvedYearId);
    }

    async getTeacherWorkloadAnalytics(schoolId: number, academicYearId: number) {
        const resolvedYearId = await this.ensureAcademicYear(schoolId, academicYearId);
        return this.analytics.getTeacherWorkloadAnalytics(schoolId, resolvedYearId);
    }

    async getGroupSubjectDistribution(schoolId: number, academicYearId: number, groupId: number) {
        const resolvedYearId = await this.ensureAcademicYear(schoolId, academicYearId);
        return this.analytics.getGroupSubjectDistribution(schoolId, resolvedYearId, groupId);
    }

    async countEntriesByDay(schoolId: number, academicYearId: number, day: DayOfWeek, classId?: number) {
        const resolvedYearId = await this.ensureAcademicYear(schoolId, academicYearId);
        
        // 1. If this is a global check (no classId), we should only count entries 
        // for classes that DO NOT have an explicit override for this day that makes it a working day.
        // If a class HAS an override, its entries are "safe" and shouldn't block a global holiday change.
        let excludedClassIds: number[] = [];
        if (!classId) {
            const overrides = await this.prisma.workingPattern.findMany({
                where: { 
                    schoolId, 
                    academicYearId: resolvedYearId, 
                    dayOfWeek: day, 
                    classId: { not: null },
                    isWorking: true 
                },
                select: { classId: true }
            });
            excludedClassIds = overrides.map(o => o.classId).filter((id): id is number => id !== null);
        }

        // 2. Count entries filtering by the determined scope
        const count = await this.prisma.timetableEntry.count({
            where: {
                schoolId,
                academicYearId: resolvedYearId,
                day,
                ...(classId 
                    ? { group: { classId } } 
                    : excludedClassIds.length > 0 
                        ? { group: { classId: { notIn: excludedClassIds } } }
                        : {}
                )
            }
        });
        return { count };
    }
}
