import { Injectable, BadRequestException, NotFoundException, forwardRef, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SetWorkingPatternDto, CreateCalendarExceptionDto, UpdateCalendarExceptionDto, CalendarResponse, CalendarDay, CloneCalendarDto } from './dto/calendar.dto';
import { DayOfWeek, DayType, AcademicYearStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TimetableService } from '../timetable/timetable.service';
import { CalendarEvents } from './calendar.constants';

@Injectable()
export class CalendarService {
    constructor(
        private prisma: PrismaService,
        private eventEmitter: EventEmitter2,
        @Inject(forwardRef(() => TimetableService))
        private timetableService: TimetableService
    ) { }

    // 1. Working Patterns
    async getWorkingPattern(schoolId: number, academicYearId: number, classId?: number) {
        return this.prisma.workingPattern.findMany({
            where: { 
                schoolId, 
                academicYearId,
                classId: classId || null
            },
        });
    }

    async setWorkingPattern(schoolId: number, dto: SetWorkingPatternDto) {
        const year = await this.prisma.academicYear.findFirst({
            where: { id: dto.academicYearId, schoolId },
        });
        if (!year || year.schoolId !== schoolId) throw new NotFoundException('Academic year not found');
        if (year.status === AcademicYearStatus.CLOSED) throw new BadRequestException('Cannot modify patterns for a CLOSED academic year');
        
        // Safety Guard: Check if any day being marked as a holiday has active classes
        const holidayRequests = dto.days.filter(d => !d.isWorking);
        if (holidayRequests.length > 0) {
            // Batch efficiency: Check all days at once or loop (7 max anyway)
            for (const req of holidayRequests) {
                const { count } = await this.timetableService.countEntriesByDay(
                    schoolId,
                    dto.academicYearId,
                    req.dayOfWeek as any,
                    dto.classId
                );
                if (count > 0) {
                    const scope = dto.classId ? 'this class' : 'the school';
                    throw new BadRequestException(
                        `Cannot mark ${req.dayOfWeek} as a holiday for ${scope} because it has ${count} scheduled classes. Please clear the timetable for that day first.`
                    );
                }
            }
        }

        // Validate Class Ownership
        if (dto.classId) {
            const classExists = await this.prisma.class.findFirst({
                where: { id: dto.classId, schoolId },
            });
            if (!classExists) throw new NotFoundException('Class not found or does not belong to this school');
        }

        // Use a transaction for the entire set of operations
        await this.prisma.$transaction(async (tx) => {
            for (const day of dto.days) {
                const existing = await tx.workingPattern.findFirst({
                    where: {
                        schoolId,
                        academicYearId: dto.academicYearId,
                        dayOfWeek: day.dayOfWeek,
                        classId: dto.classId || null
                    }
                });

                if (existing) {
                    await tx.workingPattern.update({
                        where: { id: existing.id },
                        data: { isWorking: day.isWorking }
                    });
                } else {
                    await tx.workingPattern.create({
                        data: {
                            schoolId,
                            academicYearId: dto.academicYearId,
                            dayOfWeek: day.dayOfWeek,
                            isWorking: day.isWorking,
                            classId: dto.classId || null
                        }
                    });
                }
            }
        });

        this.eventEmitter.emit(CalendarEvents.WORKING_PATTERN_UPDATED, {
            schoolId,
            academicYearId: dto.academicYearId,
            classId: dto.classId,
            patterns: dto.days
        });

        return this.getWorkingPattern(schoolId, dto.academicYearId, dto.classId);
    }

    // 2. Exceptions
    async getExceptions(schoolId: number, academicYearId: number) {
        return this.prisma.calendarException.findMany({
            where: { schoolId, academicYearId },
            orderBy: { date: 'asc' },
        });
    }

    async addException(schoolId: number, dto: CreateCalendarExceptionDto) {
        const year = await this.prisma.academicYear.findFirst({
            where: { id: dto.academicYearId, schoolId },
        });
        if (!year || year.schoolId !== schoolId) throw new NotFoundException('Academic year not found');
        if (year.status === AcademicYearStatus.CLOSED) throw new BadRequestException('Cannot add exceptions to a CLOSED academic year');

        // Validate Date within Year (Strict UTC comparison)
        const date = this.toSafeDate(dto.date);
        
        // Normalize range markers to UTC midnight for comparison
        const yearStart = this.toSafeDate(year.startDate.toISOString());
        const yearEnd = this.toSafeDate(year.endDate.toISOString());

        if (date < yearStart || date > yearEnd) {
            throw new BadRequestException(`Date ${dto.date} is outside the range of academic year: ${year.name} (${yearStart.toISOString().split('T')[0]} to ${yearEnd.toISOString().split('T')[0]})`);
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

        // Safety Guard for Holidays
        if (dto.type === 'HOLIDAY') {
            const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
            const dayOfWeek = dayNames[date.getUTCDay()] as DayOfWeek;
            
            const { count } = await this.timetableService.countEntriesByDay(
                schoolId,
                dto.academicYearId,
                dayOfWeek,
                dto.classId
            );

            if (count > 0) {
                const scope = dto.classId ? 'this class' : 'the school';
                throw new BadRequestException(
                    `Cannot mark this date as a holiday for ${scope} because it has ${count} scheduled classes. Please clear the timetable for this day first.`
                );
            }
        }

        // Validate Class Ownership
        if (dto.classId) {
            const classExists = await this.prisma.class.findFirst({
                where: { id: dto.classId, schoolId },
            });
            if (!classExists) throw new NotFoundException('Class not found or does not belong to this school');
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
        const check = await this.prisma.calendarException.findFirst({
            where: { id, schoolId },
            include: { academicYear: true }
        });
        if (!check || check.schoolId !== schoolId) throw new NotFoundException('Exception not found');

        if (check.academicYear.status === AcademicYearStatus.CLOSED) {
            throw new BadRequestException('Cannot modify exceptions of a CLOSED academic year');
        }

        if (dto.date) {
            const newDate = this.toSafeDate(dto.date);
            const yearStart = this.toSafeDate(check.academicYear.startDate.toISOString());
            const yearEnd = this.toSafeDate(check.academicYear.endDate.toISOString());

            if (newDate < yearStart || newDate > yearEnd) {
                throw new BadRequestException('New date is outside the academic year range');
            }
        }

        // BUG FIX: Run the timetable safety check BEFORE committing the DB update.
        // Previously the check ran after update — meaning the DB was mutated even if the check failed.
        if (dto.type === 'HOLIDAY' || (dto.type === undefined && check.type === 'HOLIDAY')) {
            const checkDate = dto.date ? this.toSafeDate(dto.date) : check.date;
            const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
            const dayOfWeek = dayNames[checkDate.getUTCDay()] as DayOfWeek;
            const checkClassId = dto.classId !== undefined ? dto.classId : check.classId;

            const { count } = await this.timetableService.countEntriesByDay(
                schoolId,
                check.academicYearId,
                dayOfWeek,
                checkClassId || undefined
            );

            if (count > 0) {
                const scope = checkClassId ? 'this class' : 'the school';
                throw new BadRequestException(
                    `Cannot mark this date as a holiday for ${scope} because it has ${count} scheduled classes. Please clear the timetable for this day first.`
                );
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
        const check = await this.prisma.calendarException.findFirst({ 
            where: { id, schoolId }, 
            include: { academicYear: true } 
        });
        if (!check || check.schoolId !== schoolId) throw new NotFoundException('Exception not found');
        if (check.academicYear.status === AcademicYearStatus.CLOSED) {
            throw new BadRequestException('Cannot delete exceptions of a CLOSED academic year');
        }

        const result = await this.prisma.calendarException.delete({ where: { id } });
        this.eventEmitter.emit(CalendarEvents.EXCEPTION_DELETED, { schoolId, exceptionId: id });
        return result;
    }

    async cloneCalendar(schoolId: number, dto: CloneCalendarDto) {
        const sourceYear = await this.prisma.academicYear.findFirst({ where: { id: dto.sourceYearId, schoolId } });
        const targetYear = await this.prisma.academicYear.findFirst({ where: { id: dto.targetYearId, schoolId } });

        if (!sourceYear || sourceYear.schoolId !== schoolId) throw new NotFoundException('Source year not found');
        if (!targetYear || targetYear.schoolId !== schoolId) throw new NotFoundException('Target year not found');
        if (targetYear.status === AcademicYearStatus.CLOSED) {
            throw new BadRequestException('Cannot clone calendar to a CLOSED academic year');
        }

        const operations: any[] = [];

        // 1. Copy Patterns
        if (dto.copyPatterns !== false) {
            const patterns = await this.prisma.workingPattern.findMany({ 
                where: { schoolId, academicYearId: dto.sourceYearId } 
            });
            patterns.forEach(p => {
                operations.push(this.prisma.workingPattern.upsert({
                    where: {
                        schoolId_academicYearId_dayOfWeek_classId: {
                            schoolId,
                            academicYearId: dto.targetYearId,
                            dayOfWeek: p.dayOfWeek,
                            classId: (p.classId ?? null) as any
                        }
                    },
                    update: { isWorking: p.isWorking },
                    create: { 
                        schoolId, 
                        academicYearId: dto.targetYearId, 
                        dayOfWeek: p.dayOfWeek, 
                        isWorking: p.isWorking,
                        classId: (p.classId ?? null) as any
                    }
                }));
            });
        }

        // 2. Copy Exceptions (Global only)
        if (dto.copyExceptions !== false) {
            const exceptions = await this.prisma.calendarException.findMany({
                where: { schoolId, academicYearId: dto.sourceYearId, classId: null }
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
        // Normalize input range to UTC midnights
        const startDate = this.toSafeDate(startStr);
        const endDate = this.toSafeDate(endStr);

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

        // Pre-normalize year boundaries for fast lookups
        const normalizedYears = academicYears.map(y => ({
            ...y,
            utcStart: this.toSafeDate(y.startDate.toISOString()),
            utcEnd: this.toSafeDate(y.endDate.toISOString())
        }));

        const yearIds = academicYears.map(y => y.id);
        const allPatterns = yearIds.length ? await this.prisma.workingPattern.findMany({
            where: { 
                schoolId, 
                academicYearId: { in: yearIds },
                OR: [
                    { classId: null },
                    ...(classId ? [{ classId }] : [])
                ]
            }
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

        // ENTERPRISE FIX: Use a dedicated UTC cursor to avoid DST skips/doubles
        let cursor = new Date(startDate);
        while (cursor <= endDate) {
            const dateString = this.formatDateKey(cursor);
            const dayOfWeek = cursor.getUTCDay();

            const activeYear = normalizedYears.find(y => cursor >= y.utcStart && cursor <= y.utcEnd);

            if (!activeYear) {
                days.push({
                    date: dateString,
                    dayOfWeek,
                    type: DayType.WORKING,
                    isWorking: false,
                    title: undefined,
                    academicYearId: 0
                });
            } else {
                const yearPatterns = allPatterns.filter(p => p.academicYearId === activeYear.id);
                const patternMap = new Map<number, boolean>();
                
                yearPatterns.filter(p => p.classId === null).forEach(p => {
                    patternMap.set(this.mapDayOfWeekToJs(p.dayOfWeek), p.isWorking);
                });
                
                if (classId) {
                    yearPatterns.filter(p => p.classId === classId).forEach(p => {
                        patternMap.set(this.mapDayOfWeekToJs(p.dayOfWeek), p.isWorking);
                    });
                }

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

            // Advance cursor by exactly one UTC day
            cursor.setUTCDate(cursor.getUTCDate() + 1);
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
        // Ensure date is UTC midnight for comparison
        const targetDate = this.toSafeDate(date.toISOString());
        
        const activeYear = await this.prisma.academicYear.findFirst({
            where: {
                schoolId,
                startDate: { lte: targetDate },
                endDate: { gte: targetDate }
            }
        });

        if (!activeYear) return { isValid: false, reason: 'Outside Academic Year' };

        const dayName = this.mapJsToPrisma(targetDate.getUTCDay());
        
        const patterns = await this.prisma.workingPattern.findMany({
            where: {
                schoolId,
                academicYearId: activeYear.id,
                dayOfWeek: dayName,
                OR: [
                    { classId: null },
                    ...(classId ? [{ classId }] : [])
                ]
            }
        });

        const classPattern = patterns.find(p => p.classId !== null);
        const schoolPattern = patterns.find(p => p.classId === null);
        const isWorkingByPattern = (classPattern || schoolPattern)?.isWorking ?? false;

        const exception = await this.prisma.calendarException.findFirst({
            where: {
                schoolId,
                date: targetDate, // Already UTC normalized
                OR: [
                    { classId: null },
                    ...(classId ? [{ classId }] : [])
                ]
            },
            orderBy: { classId: 'desc' }
        });

        let type: DayType = DayType.WORKING;
        let isWorking = isWorkingByPattern;

        if (!isWorking) type = DayType.HOLIDAY;

        if (exception) {
            type = exception.type;
            isWorking = (type === DayType.WORKING || type === DayType.SPECIAL_WORKING);
        }

        return { isValid: true, type, isWorking, academicYearId: activeYear.id };
    }

    // --- Enterprise Grade Date Helpers ---

    private toSafeDate(dateStr: string): Date {
        if (!dateStr) {
            const now = new Date();
            return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        }
        const clean = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
        const [y, m, d] = clean.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, d));
    }

    private formatDateKey(d: Date): string {
        const year = d.getUTCFullYear();
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private mapJsToPrisma(day: number): DayOfWeek {
        const map = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
        return map[day] as DayOfWeek;
    }
}
