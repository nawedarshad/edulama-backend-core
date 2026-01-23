import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DayOfWeek, TimetableOverrideType } from '@prisma/client';
import { CalendarService } from '../../principal/calendar/calendar.service';

@Injectable()
export class StudentTimetableService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly calendarService: CalendarService
    ) { }

    private getDayOfWeek(dateString: string): DayOfWeek {
        const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
        const date = new Date(dateString);
        return days[date.getDay()] as DayOfWeek;
    }

    private async getStudentSection(schoolId: number, userId: number, academicYearId: number) {
        const student = await this.prisma.studentProfile.findFirst({
            where: { schoolId, userId },
            select: { sectionId: true, classId: true }
        });

        if (!student) {
            throw new NotFoundException('Student profile not found');
        }

        return student;
    }

    async getWeeklyTimetable(schoolId: number, userId: number, academicYearId: number) {
        const { sectionId } = await this.getStudentSection(schoolId, userId, academicYearId);

        // Fetch Working Pattern to filter non-working days
        const patterns = await this.calendarService.getWorkingPattern(schoolId, academicYearId);
        const workingDays = new Set(patterns.filter(p => p.isWorking).map(p => p.dayOfWeek));

        const entries = await this.prisma.timetableEntry.findMany({
            where: {
                schoolId,
                academicYearId,
                sectionId,
            },
            include: {
                class: { select: { id: true, name: true } },
                section: { select: { id: true, name: true } },
                subject: { select: { id: true, name: true, code: true, color: true } },
                period: true,
                room: { select: { id: true, name: true } },
                teacher: { select: { id: true, user: { select: { name: true } } } },
            },
            orderBy: [
                { day: 'asc' },
                { period: { startTime: 'asc' } }
            ]
        });

        // Filter out entries on non-working days
        const filteredEntries = entries.filter(e => workingDays.has(e.day));

        const grouped = filteredEntries.reduce((acc, entry) => {
            if (!acc[entry.day]) acc[entry.day] = [];
            acc[entry.day].push(entry);
            return acc;
        }, {} as Record<string, typeof entries>);

        return grouped;
    }

    async getDailyTimetable(schoolId: number, userId: number, academicYearId: number, date: string) {
        const dateObj = new Date(date);

        // 1. Check if it's a working day
        const dayCheck = await this.calendarService.validateDate(schoolId, dateObj);
        if (!dayCheck.isWorking) {
            return []; // Holiday or Non-working day
        }

        const dayOfWeek = this.getDayOfWeek(date);
        const { sectionId } = await this.getStudentSection(schoolId, userId, academicYearId);

        // 2. Regular Entries
        const regularEntries = await this.prisma.timetableEntry.findMany({
            where: {
                schoolId,
                academicYearId,
                sectionId,
                day: dayOfWeek,
            },
            include: {
                class: { select: { id: true, name: true } },
                section: { select: { id: true, name: true } },
                subject: { select: { id: true, name: true, code: true, color: true } },
                period: true,
                room: { select: { id: true, name: true } },
                teacher: { select: { id: true, user: { select: { name: true } } } },
            },
            orderBy: { period: { startTime: 'asc' } }
        });

        // 3. Overrides (Cancellations or Substitutions for this section's classes)
        const overrides = await this.prisma.timetableOverride.findMany({
            where: {
                schoolId,
                academicYearId,
                date: dateObj,
                entry: { sectionId },
            },
            include: {
                substituteTeacher: { select: { id: true, user: { select: { name: true } } } }
            }
        });

        // 4. Merge
        const finalSchedule = regularEntries.map(entry => {
            const override = overrides.find(o => o.entryId === entry.id);
            if (override) {
                return {
                    ...entry,
                    status: override.type === TimetableOverrideType.CANCELLED ? 'CANCELLED' : 'SUBSTITUTED',
                    overrideNote: override.note,
                    substituteTeacher: override.substituteTeacher,
                    currentTeacher: override.substituteTeacher || entry.teacher // Display substitute if assigned
                };
            }
            return {
                ...entry,
                status: 'REGULAR',
                currentTeacher: entry.teacher
            };
        });

        return finalSchedule;
    }
}
