import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DayOfWeek, TimetableOverrideType } from '@prisma/client';
import { CalendarService } from '../../principal/calendar/calendar.service';

@Injectable()
export class ParentTimetableService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly calendarService: CalendarService
    ) { }

    private getDayOfWeek(dateString: string): DayOfWeek {
        const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
        const date = new Date(dateString);
        return days[date.getDay()] as DayOfWeek;
    }

    private async validateAndGetStudentSection(schoolId: number, parentUserId: number, studentId: number) {
        // 1. Verify Parent-Child Link
        const studentProfile = await this.prisma.studentProfile.findFirst({
            where: {
                id: studentId,
                schoolId,
                parents: {
                    some: {
                        parent: {
                            userId: parentUserId
                        }
                    }
                }
            },
            select: { sectionId: true, classId: true }
        });

        if (!studentProfile) {
            throw new ForbiddenException('You can only view timetables for your own children.');
        }

        return studentProfile;
    }

    async getWeeklyTimetable(schoolId: number, parentUserId: number, studentId: number, academicYearId: number) {
        const { sectionId } = await this.validateAndGetStudentSection(schoolId, parentUserId, studentId);

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

    async getDailyTimetable(schoolId: number, parentUserId: number, studentId: number, academicYearId: number, date: string) {
        const dateObj = new Date(date);

        // 1. Check if it's a working day
        const dayCheck = await this.calendarService.validateDate(schoolId, dateObj);
        if (!dayCheck.isWorking) {
            return []; // Holiday or Non-working day
        }

        const dayOfWeek = this.getDayOfWeek(date);
        const { sectionId } = await this.validateAndGetStudentSection(schoolId, parentUserId, studentId);

        // 2. Regular
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

        // 3. Overrides
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
                    currentTeacher: override.substituteTeacher || entry.teacher
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
