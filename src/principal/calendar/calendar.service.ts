import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SetWorkingPatternDto, CreateCalendarExceptionDto, UpdateCalendarExceptionDto, CalendarResponse, CalendarDay } from './dto/calendar.dto';
import { DayOfWeek, DayType, AcademicYearStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CalendarEvents } from './calendar.constants';

@Injectable()
export class CalendarService {
    constructor(
        private prisma: PrismaService,
        private eventEmitter: EventEmitter2
    ) { }

    // 1. Working Patterns
    async getWorkingPattern(schoolId: number, academicYearId: number) {
        return this.prisma.workingPattern.findMany({
            where: { schoolId, academicYearId },
        });
    }

    async setWorkingPattern(schoolId: number, dto: SetWorkingPatternDto) {
        // ... (validation existing)
        const year = await this.prisma.academicYear.findUnique({
            where: { id: dto.academicYearId },
        });
        if (!year || year.schoolId !== schoolId) throw new NotFoundException('Academic year not found');
        if (year.status === AcademicYearStatus.CLOSED) throw new BadRequestException('Cannot modify patterns for a CLOSED academic year');

        // Idempotent Upsert
        const operations = dto.days.map((day) =>
            this.prisma.workingPattern.upsert({
                where: {
                    schoolId_academicYearId_dayOfWeek: {
                        schoolId,
                        academicYearId: dto.academicYearId,
                        dayOfWeek: day.dayOfWeek,
                    },
                },
                update: { isWorking: day.isWorking },
                create: {
                    schoolId,
                    academicYearId: dto.academicYearId,
                    dayOfWeek: day.dayOfWeek,
                    isWorking: day.isWorking,
                },
            }),
        );

        await this.prisma.$transaction(operations);

        this.eventEmitter.emit(CalendarEvents.WORKING_PATTERN_UPDATED, {
            schoolId,
            academicYearId: dto.academicYearId,
            patterns: dto.days
        });

        return this.getWorkingPattern(schoolId, dto.academicYearId);
    }

    // 2. Exceptions
    async getExceptions(schoolId: number, academicYearId: number) {
        return this.prisma.calendarException.findMany({
            where: { schoolId, academicYearId },
            orderBy: { date: 'asc' },
        });
    }

    async addException(schoolId: number, dto: CreateCalendarExceptionDto) {
        // ... (validation existing)
        const year = await this.prisma.academicYear.findUnique({
            where: { id: dto.academicYearId },
        });
        if (!year || year.schoolId !== schoolId) throw new NotFoundException('Academic year not found');
        if (year.status === AcademicYearStatus.CLOSED) throw new BadRequestException('Cannot add exceptions to a CLOSED academic year');

        // Validate Date within Year
        const date = new Date(dto.date);
        if (date < year.startDate || date > year.endDate) {
            throw new BadRequestException('Date is outside the academic year range');
        }

        const exception = await this.prisma.calendarException.create({
            data: {
                schoolId,
                academicYearId: dto.academicYearId,
                date: date,
                type: dto.type,
                title: dto.title,
                description: dto.description,
                classId: dto.classId,
            },
        });

        this.eventEmitter.emit(CalendarEvents.EXCEPTION_Created, { schoolId, exception });
        return exception;
    }

    async updateException(schoolId: number, id: number, dto: UpdateCalendarExceptionDto) {
        // ... (validation existing)
        const check = await this.prisma.calendarException.findUnique({
            where: { id },
            include: { academicYear: true } // Need status
        });
        if (!check || check.schoolId !== schoolId) throw new NotFoundException('Exception not found');

        if (check.academicYear.status === AcademicYearStatus.CLOSED) {
            throw new BadRequestException('Cannot modify exceptions of a CLOSED academic year');
        }

        if (dto.date) {
            const newDate = new Date(dto.date);
            if (newDate < check.academicYear.startDate || newDate > check.academicYear.endDate) {
                throw new BadRequestException('New date is outside the academic year range');
            }
        }

        const exception = await this.prisma.calendarException.update({
            where: { id },
            data: {
                date: dto.date ? new Date(dto.date) : undefined,
                type: dto.type,
                title: dto.title,
                description: dto.description,
                classId: dto.classId,
            },
        });

        this.eventEmitter.emit(CalendarEvents.EXCEPTION_UPDATED, { schoolId, exception });
        return exception;
    }

    async deleteException(schoolId: number, id: number) {
        const check = await this.prisma.calendarException.findUnique({ where: { id }, include: { academicYear: true } });
        if (!check || check.schoolId !== schoolId) throw new NotFoundException('Exception not found');
        if (check.academicYear.status === AcademicYearStatus.CLOSED) {
            throw new BadRequestException('Cannot delete exceptions of a CLOSED academic year');
        }

        const result = await this.prisma.calendarException.delete({ where: { id } });
        this.eventEmitter.emit(CalendarEvents.EXCEPTION_DELETED, { schoolId, exceptionId: id });
        return result;
    }

    // 3. Calendar Generation
    // 3. Calendar Generation (Enterprise Grade)
    async generateCalendar(schoolId: number, startStr: string, endStr: string, classId?: number, academicYearId?: number): Promise<CalendarResponse> {
        const startDate = new Date(startStr);
        const endDate = new Date(endStr);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            throw new BadRequestException('Invalid date format');
        }

        if (startDate > endDate) {
            throw new BadRequestException('Start date must be before end date');
        }

        // DoS Protection: Limit range to 2 years
        const twoYearsInMillis = 2 * 365 * 24 * 60 * 60 * 1000;
        if (endDate.getTime() - startDate.getTime() > twoYearsInMillis) {
            throw new BadRequestException('Date range cannot exceed 2 years');
        }

        // IDOR Protection: Verify Class Ownership
        if (classId) {
            const classExists = await this.prisma.class.findFirst({
                where: { id: classId, schoolId },
            });
            if (!classExists) throw new NotFoundException('Class not found or does not belong to this school');
        }

        // 1. Context Resolution: Find Academic Year(s) covering this range
        // Note: A range might span two academic years. For simplicity, we fetch the FIRST matching one or filter by range.
        // Enterprise Scalability: Handle multi-year span.
        const academicYears = await this.prisma.academicYear.findMany({
            where: {
                schoolId,
                id: academicYearId, // Optional filter
                startDate: { lte: endDate },
                endDate: { gte: startDate },
            },
        });

        if (academicYears.length === 0) {
            return { days: [], meta: { message: "No academic year found for this period" } };
        }

        const days: CalendarDay[] = [];

        for (const academicYear of academicYears) {
            // Determine effective range for this specific academic year intersection
            const effectiveStart = startDate > academicYear.startDate ? startDate : academicYear.startDate;
            const effectiveEnd = endDate < academicYear.endDate ? endDate : academicYear.endDate;

            // 2. Fetch Rules
            const patterns = await this.getWorkingPattern(schoolId, academicYear.id);
            const patternMap = new Map(patterns.map(p => [this.mapDayOfWeekToJs(p.dayOfWeek), p.isWorking]));

            // 3. Fetch Exceptions (Global + Class)
            // Inheritance: Specific Class Exceptions Override Global Exceptions
            const globalExceptions = await this.prisma.calendarException.findMany({
                where: {
                    schoolId,
                    academicYearId: academicYear.id,
                    date: { gte: effectiveStart, lte: effectiveEnd },
                    classId: null
                },
            });

            const classExceptions = classId ? await this.prisma.calendarException.findMany({
                where: {
                    schoolId,
                    academicYearId: academicYear.id,
                    date: { gte: effectiveStart, lte: effectiveEnd },
                    classId: classId
                },
            }) : [];

            // Merge: Class overwrites Global
            // Map key: DateString
            const exceptionMap = new Map<string, any>();
            globalExceptions.forEach(e => exceptionMap.set(e.date.toISOString().split('T')[0], e));
            classExceptions.forEach(e => exceptionMap.set(e.date.toISOString().split('T')[0], e)); // Overwrite

            // 4. Generate Days
            for (let d = new Date(effectiveStart); d <= effectiveEnd; d.setDate(d.getDate() + 1)) {
                // Check if current date is within the requested global range (redundant but safe)
                if (d < startDate || d > endDate) continue;

                const dateString = d.toISOString().split('T')[0];
                const dayOfWeek = d.getDay(); // 0-6

                let type: DayType = DayType.WORKING;
                let isWorking = patternMap.get(dayOfWeek) ?? true; // Default to working
                if (patterns.length === 0) isWorking = false; // Safe default if no setup

                if (!isWorking) type = DayType.HOLIDAY;

                // Last Saturday logic
                if (dayOfWeek === 6) {
                    const nextWeek = new Date(d);
                    nextWeek.setDate(d.getDate() + 7);
                    if (nextWeek.getMonth() !== d.getMonth()) {
                        isWorking = false;
                        type = DayType.HOLIDAY;
                    }
                }

                const exception = exceptionMap.get(dateString);
                if (exception) {
                    type = exception.type;
                    isWorking = (type === DayType.WORKING || type === DayType.SPECIAL_WORKING);
                }

                days.push({
                    date: dateString,
                    dayOfWeek,
                    type,
                    isWorking,
                    title: exception?.title || (type === DayType.HOLIDAY ? 'Holiday' : undefined),
                    academicYearId: academicYear.id
                });
            }
        }

        // Sort days by date (handling multi-year merge)
        days.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        return { days, meta: { count: days.length, range: { start: startStr, end: endStr } } };
    }

    async getStats(schoolId: number, startStr: string, endStr: string, classId?: number) {
        const calendar = await this.generateCalendar(schoolId, startStr, endStr, classId);

        const stats = {
            totalDays: calendar.days.length,
            workingDays: 0,
            holidays: 0,
            specialWorkingDays: 0,
            events: 0,
        };

        calendar.days.forEach(day => {
            if (day.isWorking) stats.workingDays++;
            else stats.holidays++;

            if (day.type === DayType.SPECIAL_WORKING) stats.specialWorkingDays++;
            if (day.type === DayType.EVENT) stats.events++;
        });

        return stats;
    }

    // Helper
    private mapDayOfWeekToJs(day: DayOfWeek): number {
        const map: Record<DayOfWeek, number> = {
            SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6
        };
        return map[day];
    }

    // 4. Public Validation API
    async validateDate(schoolId: number, date: Date) {
        const academicYear = await this.prisma.academicYear.findFirst({
            where: {
                schoolId,
                startDate: { lte: date },
                endDate: { gte: date }
            }
        });

        if (!academicYear) return { isValid: false, reason: 'Outside Academic Year' };

        const pattern = await this.prisma.workingPattern.findFirst({
            where: { schoolId, academicYearId: academicYear.id, dayOfWeek: this.mapJsToPrisma(date.getDay()) }
        });

        const exception = await this.prisma.calendarException.findFirst({
            where: { schoolId, date, classId: null }
        });

        let type: DayType = DayType.WORKING;
        let isWorking = pattern?.isWorking ?? false; // Default false if not found

        if (!isWorking) type = DayType.HOLIDAY;

        if (exception) {
            type = exception.type;
            isWorking = (type === DayType.WORKING || type === DayType.SPECIAL_WORKING);
        }

        return { isValid: true, type, isWorking, academicYearId: academicYear.id };
    }

    private mapJsToPrisma(day: number): DayOfWeek {
        const map = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
        return map[day] as DayOfWeek;
    }
}
