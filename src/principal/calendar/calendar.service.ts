import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SetWorkingPatternDto, CreateCalendarExceptionDto, UpdateCalendarExceptionDto, CalendarResponse, CalendarDay, CloneCalendarDto } from './dto/calendar.dto';
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
        const year = await this.prisma.academicYear.findUnique({
            where: { id: dto.academicYearId },
        });
        if (!year || year.schoolId !== schoolId) throw new NotFoundException('Academic year not found');
        if (year.status === AcademicYearStatus.CLOSED) throw new BadRequestException('Cannot add exceptions to a CLOSED academic year');

        // Validate Date within Year
        const date = this.toSafeDate(dto.date);
        if (date < year.startDate || date > year.endDate) {
            throw new BadRequestException('Date is outside the academic year range');
        }

        // Uniqueness Guard
        const existing = await this.prisma.calendarException.findFirst({
            where: {
                schoolId,
                academicYearId: dto.academicYearId,
                date,
                classId: dto.classId || null
            }
        });
        if (existing) throw new BadRequestException('Exception already exists for this date and scope');

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
        const check = await this.prisma.calendarException.findUnique({
            where: { id },
            include: { academicYear: true }
        });
        if (!check || check.schoolId !== schoolId) throw new NotFoundException('Exception not found');

        if (check.academicYear.status === AcademicYearStatus.CLOSED) {
            throw new BadRequestException('Cannot modify exceptions of a CLOSED academic year');
        }

        if (dto.date) {
            const newDate = this.toSafeDate(dto.date);
            if (newDate < check.academicYear.startDate || newDate > check.academicYear.endDate) {
                throw new BadRequestException('New date is outside the academic year range');
            }
        }

        const exception = await this.prisma.calendarException.update({
            where: { id },
            data: {
                date: dto.date ? this.toSafeDate(dto.date) : undefined,
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

    async cloneCalendar(schoolId: number, dto: CloneCalendarDto) {
        const sourceYear = await this.prisma.academicYear.findUnique({ where: { id: dto.sourceYearId } });
        const targetYear = await this.prisma.academicYear.findUnique({ where: { id: dto.targetYearId } });

        if (!sourceYear || sourceYear.schoolId !== schoolId) throw new NotFoundException('Source year not found');
        if (!targetYear || targetYear.schoolId !== schoolId) throw new NotFoundException('Target year not found');

        const operations: any[] = [];

        // 1. Copy Patterns
        if (dto.copyPatterns !== false) {
            const patterns = await this.prisma.workingPattern.findMany({ where: { academicYearId: dto.sourceYearId } });
            patterns.forEach(p => {
                operations.push(this.prisma.workingPattern.upsert({
                    where: {
                        schoolId_academicYearId_dayOfWeek: {
                            schoolId,
                            academicYearId: dto.targetYearId,
                            dayOfWeek: p.dayOfWeek
                        }
                    },
                    update: { isWorking: p.isWorking },
                    create: { schoolId, academicYearId: dto.targetYearId, dayOfWeek: p.dayOfWeek, isWorking: p.isWorking }
                }));
            });
        }

        // 2. Copy Exceptions (Global only)
        if (dto.copyExceptions !== false) {
            const exceptions = await this.prisma.calendarException.findMany({
                where: { academicYearId: dto.sourceYearId, classId: null }
            });

            const targetExisting = await this.prisma.calendarException.findMany({
                where: { academicYearId: dto.targetYearId, classId: null }
            });
            const targetExistingDates = new Set(targetExisting.map(e => e.date.toISOString()));

            exceptions.forEach(ex => {
                // Use day offsets for accurate cloning across different year structures
                const dayOffset = Math.floor((ex.date.getTime() - sourceYear.startDate.getTime()) / (1000 * 60 * 60 * 24));
                const targetDate = new Date(targetYear.startDate);
                targetDate.setDate(targetDate.getDate() + dayOffset);

                if (targetDate >= targetYear.startDate && targetDate <= targetYear.endDate) {
                    if (targetExistingDates.has(targetDate.toISOString())) {
                        operations.push(this.prisma.calendarException.updateMany({
                            where: { schoolId, academicYearId: dto.targetYearId, date: targetDate, classId: null },
                            data: { type: ex.type, title: ex.title, description: ex.description }
                        }));
                    } else {
                        operations.push(this.prisma.calendarException.create({
                            data: {
                                schoolId,
                                academicYearId: dto.targetYearId,
                                date: targetDate,
                                type: ex.type,
                                title: ex.title,
                                description: ex.description,
                                classId: null
                            }
                        }));
                    }
                }
            });
        }

        await this.prisma.$transaction(operations);
        return { success: true, operationCount: operations.length };
    }

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

        const twoYearsInMillis = 2 * 365 * 24 * 60 * 60 * 1000;
        if (endDate.getTime() - startDate.getTime() > twoYearsInMillis) {
            throw new BadRequestException('Date range cannot exceed 2 years');
        }

        if (classId) {
            const classExists = await this.prisma.class.findFirst({
                where: { id: classId, schoolId },
            });
            if (!classExists) throw new NotFoundException('Class not found or does not belong to this school');
        }

        const academicYears = await this.prisma.academicYear.findMany({
            where: {
                schoolId,
                ...(academicYearId ? { id: academicYearId } : {})
            },
        });

        const yearIds = academicYears.map(y => y.id);
        const allPatterns = yearIds.length ? await this.prisma.workingPattern.findMany({
            where: { schoolId, academicYearId: { in: yearIds } }
        }) : [];
        const allExceptions = yearIds.length ? await this.prisma.calendarException.findMany({
            where: {
                schoolId,
                academicYearId: { in: yearIds },
                date: { gte: startDate, lte: endDate },
                OR: [
                    { classId: null },
                    ...(classId ? [{ classId }] : [])
                ]
            }
        }) : [];

        const days: CalendarDay[] = [];

        for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
            const dateString = this.formatDateKey(d);
            const dayOfWeek = d.getUTCDay();

            const activeYear = academicYears.find(y => d >= y.startDate && d <= y.endDate);

            if (!activeYear) {
                days.push({
                    date: dateString,
                    dayOfWeek,
                    type: DayType.WORKING,
                    isWorking: false,
                    title: undefined,
                    academicYearId: 0
                });
                continue;
            }

            const yearPatterns = allPatterns.filter(p => p.academicYearId === activeYear.id);
            const patternMap = new Map(yearPatterns.map(p => [this.mapDayOfWeekToJs(p.dayOfWeek), p.isWorking]));

            let type: DayType = DayType.WORKING;
            let isWorking = patternMap.has(dayOfWeek) ? patternMap.get(dayOfWeek)! : false;

            if (!isWorking) type = DayType.HOLIDAY;

            const yearExceptions = allExceptions.filter(e => e.academicYearId === activeYear.id && this.formatDateKey(e.date) === dateString);
            const exception = yearExceptions.sort((a, b) => (b.classId ? 1 : 0) - (a.classId ? 1 : 0))[0];

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
                academicYearId: activeYear.id
            });
        }

        const fallbackYear = academicYears.find(y => y.status === 'ACTIVE') || academicYears[0];

        return {
            days,
            meta: {
                count: days.length,
                range: { start: startStr, end: endStr },
                academicYearId: fallbackYear?.id || null,
                academicYear: fallbackYear ? {
                    startDate: fallbackYear.startDate.toISOString(),
                    endDate: fallbackYear.endDate.toISOString()
                } : null
            }
        };
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

    private mapDayOfWeekToJs(day: DayOfWeek): number {
        const map: Record<DayOfWeek, number> = {
            SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6
        };
        return map[day];
    }

    async validateDate(schoolId: number, date: Date, classId?: number) {
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
            where: {
                schoolId,
                date,
                OR: [
                    { classId: null },
                    ...(classId ? [{ classId }] : [])
                ]
            },
            orderBy: { classId: 'desc' } // Class-level override (id not null) first
        });

        let type: DayType = DayType.WORKING;
        let isWorking = pattern?.isWorking ?? false;

        if (!isWorking) type = DayType.HOLIDAY;

        if (exception) {
            type = exception.type;
            isWorking = (type === DayType.WORKING || type === DayType.SPECIAL_WORKING);
        }

        return { isValid: true, type, isWorking, academicYearId: academicYear.id };
    }

    // --- Enterprise Grade Date Helpers ---

    private toSafeDate(dateStr: string): Date {
        if (!dateStr) return new Date();
        const clean = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
        return new Date(`${clean}T00:00:00`);
    }

    private formatDateKey(d: Date): string {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private mapJsToPrisma(day: number): DayOfWeek {
        const map = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
        return map[day] as DayOfWeek;
    }
}
