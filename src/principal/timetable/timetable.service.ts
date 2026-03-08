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
        await this.checkYearLock(schoolId, academicYearId);
        return this.periods.createTimePeriod(schoolId, academicYearId, dto);
    }

    async findAllTimePeriods(schoolId: number, academicYearId: number) {
        return this.periods.findAllTimePeriods(schoolId, academicYearId);
    }

    async updateTimePeriod(schoolId: number, academicYearId: number, id: number, dto: CreateTimePeriodDto) {
        await this.checkYearLock(schoolId, academicYearId);
        return this.periods.updateTimePeriod(schoolId, academicYearId, id, dto);
    }

    async deleteTimePeriod(schoolId: number, id: number) {
        const period = await this.prisma.timePeriod.findUnique({
            where: { id_schoolId: { id, schoolId } }
        });
        if (period) await this.checkYearLock(schoolId, period.academicYearId);
        return this.periods.deleteTimePeriod(schoolId, id);
    }

    async syncTimeSlots(schoolId: number, academicYearId: number, periodId: number, days: DayOfWeek[]) {
        await this.checkYearLock(schoolId, academicYearId);
        return this.periods.syncTimeSlots(schoolId, academicYearId, periodId, days);
    }

    // ----------------------------------------------------------------
    // ENTRIES
    // ----------------------------------------------------------------
    async createEntry(schoolId: number, academicYearId: number, dto: CreateTimetableEntryDto) {
        await this.checkYearLock(schoolId, academicYearId);
        return this.entries.createEntry(schoolId, academicYearId, dto);
    }

    async deleteEntry(schoolId: number, id: number) {
        const entry = await this.prisma.timetableEntry.findUnique({
            where: { id_schoolId: { id, schoolId } }
        });
        if (entry) await this.checkYearLock(schoolId, entry.academicYearId);
        return this.entries.deleteEntry(schoolId, id);
    }

    async copyTimetableStructure(schoolId: number, fromYearId: number, toYearId: number) {
        await this.checkYearLock(schoolId, toYearId);
        return this.entries.copyTimetableStructure(schoolId, fromYearId, toYearId);
    }

    // ----------------------------------------------------------------
    // AVAILABILITY & INVENTORY
    // ----------------------------------------------------------------
    async findFreeTeachers(schoolId: number, academicYearId: number, day: DayOfWeek, timeSlotId: number, subjectId?: number) {
        return this.inventory.findFreeTeachers(schoolId, academicYearId, day, timeSlotId, subjectId);
    }

    async findFreeRooms(schoolId: number, academicYearId: number, day: DayOfWeek, timeSlotId: number) {
        return this.inventory.findFreeRooms(schoolId, academicYearId, day, timeSlotId);
    }

    async checkAvailability(schoolId: number, academicYearId: number, dto: CreateTimetableEntryDto) {
        return this.inventory.checkAvailability(schoolId, academicYearId, dto);
    }

    // ----------------------------------------------------------------
    // CONTEXT & UI DATA
    // ----------------------------------------------------------------
    async getTimetableForGroup(schoolId: number, academicYearId: number, groupId: number) {
        return this.context.getTimetableForGroup(schoolId, academicYearId, groupId);
    }

    async getTimetableForRoom(schoolId: number, academicYearId: number, roomId: number) {
        return this.context.getTimetableForRoom(schoolId, academicYearId, roomId);
    }

    async getTimetableForTeacher(schoolId: number, academicYearId: number, teacherId: number) {
        return this.context.getTimetableForTeacher(schoolId, academicYearId, teacherId);
    }

    async getTimetableContext(schoolId: number, academicYearId: number, groupId: number, modules: string[] = []) {
        return this.context.getTimetableContext(schoolId, academicYearId, groupId, modules);
    }

    // ----------------------------------------------------------------
    // ANALYTICS
    // ----------------------------------------------------------------
    async getAnalyticsData(schoolId: number, academicYearId: number) {
        return this.analytics.getAnalyticsData(schoolId, academicYearId);
    }

    async getComprehensiveAnalytics(schoolId: number, academicYearId: number) {
        return this.analytics.getComprehensiveAnalytics(schoolId, academicYearId);
    }

    async getTeacherWorkloadAnalytics(schoolId: number, academicYearId: number) {
        return this.analytics.getTeacherWorkloadAnalytics(schoolId, academicYearId);
    }

    async getGroupSubjectDistribution(schoolId: number, academicYearId: number, groupId: number) {
        return this.analytics.getGroupSubjectDistribution(schoolId, academicYearId, groupId);
    }
}
