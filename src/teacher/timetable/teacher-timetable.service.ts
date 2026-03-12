import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DayOfWeek, TimetableOverrideType } from '@prisma/client';
import { DateQueryDto } from './dto/date-query.dto';

@Injectable()
export class TeacherTimetableService {
    constructor(private readonly prisma: PrismaService) { }

    private getDayOfWeek(dateString: string): DayOfWeek {
        const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
        // Parse "YYYY-MM-DD" explicitly to avoid UTC shift
        const [year, month, day] = dateString.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return days[date.getDay()] as DayOfWeek;
    }

    private mapEntry(entry: any) {
        if (!entry) return null;

        // Prefer the TimePeriod's startTime/endTime (always stored as "HH:MM" strings like "09:00")
        // over TimeSlot.startTime which may be an ISO timestamp or a raw DB value.
        const periodStartTime = entry.timeSlot?.period?.startTime ?? entry.timeSlot?.startTime;
        const periodEndTime = entry.timeSlot?.period?.endTime ?? entry.timeSlot?.endTime;

        // Normalise to "HH:MM" if the value looks like an ISO timestamp
        const normaliseTime = (t: string | null | undefined): string | undefined => {
            if (!t) return undefined;
            // ISO string like "2026-03-08T03:30:00.000Z"
            if (t.includes('T')) {
                const d = new Date(t);
                if (!isNaN(d.valueOf())) {
                    const hh = d.getHours().toString().padStart(2, '0');
                    const mm = d.getMinutes().toString().padStart(2, '0');
                    return `${hh}:${mm}`;
                }
            }
            return t; // already "HH:MM"
        };

        const period = {
            id: entry.timeSlot?.id,
            name: entry.timeSlot?.period?.name ?? `Period`,
            startTime: normaliseTime(periodStartTime),
            endTime: normaliseTime(periodEndTime),
        };

        return {
            ...entry,
            period,
            timeSlot: undefined, // Frontend expects 'period'
        };
    }

    private async resolveAcademicYearId(schoolId: number, academicYearId?: number): Promise<number> {
        if (academicYearId) return academicYearId;

        const activeYear = await this.prisma.academicYear.findFirst({
            where: {
                schoolId,
                status: 'ACTIVE',
            },
        });

        if (!activeYear) {
            // Fallback to latest if no active year (optional, depending on business logic)
            // or throw exception. For now, let's try to get *any* year to show *something*.
            const latestYear = await this.prisma.academicYear.findFirst({
                where: { schoolId },
                orderBy: { startDate: 'desc' }
            });

            if (!latestYear) {
                throw new NotFoundException('No academic year found for this school.');
            }
            return latestYear.id;
        }

        return activeYear.id;
    }

    private async getTeacherIdFromUser(userId: number): Promise<number> {
        const teacher = await this.prisma.teacherProfile.findUnique({
            where: { userId },
        });

        if (!teacher) {
            throw new NotFoundException('Teacher profile not found for this user.');
        }
        return teacher.id;
    }

    async getWeeklyTimetable(schoolId: number, userId: number, academicYearId?: number) {
        const resolvedYearId = await this.resolveAcademicYearId(schoolId, academicYearId);
        const teacherId = await this.getTeacherIdFromUser(userId);

        const entries = await this.prisma.timetableEntry.findMany({
            where: {
                schoolId,
                academicYearId: resolvedYearId,
                teacherId,
                status: { in: ['PUBLISHED', 'LOCKED'] },
            },
            include: {
                group: { select: { id: true, name: true } },
                subject: { select: { id: true, name: true, code: true, color: true } },
                timeSlot: { include: { period: true } },
                room: { select: { id: true, name: true } },
            },
            orderBy: [
                { day: 'asc' },
                { timeSlot: { startTime: 'asc' } }
            ]
        });

        // Group by day and sort numerically within each day
        const grouped = entries.reduce((acc, entry) => {
            if (!acc[entry.day]) acc[entry.day] = [];
            acc[entry.day].push(entry);
            return acc;
        }, {} as Record<string, typeof entries>);

        const parseMins = (time: string) => {
            if (!time) return 0;
            const [h, m] = time.trim().split(' ')[0].split(':').map(Number);
            return (h || 0) * 60 + (m || 0);
        };

        return Object.keys(grouped).reduce((acc, day) => {
            // Sort each day's entries numerically by start time
            const dayEntries = grouped[day].sort((a, b) =>
                parseMins(a.timeSlot?.startTime) - parseMins(b.timeSlot?.startTime)
            );
            acc[day] = dayEntries.map(e => this.mapEntry(e));
            return acc;
        }, {} as any);
    }

    async getDailyTimetable(schoolId: number, userId: number, academicYearId: number | undefined, date: string) {
        const resolvedYearId = await this.resolveAcademicYearId(schoolId, academicYearId);
        const teacherId = await this.getTeacherIdFromUser(userId);

        const dayOfWeek = this.getDayOfWeek(date);

        // Build date boundaries for override lookups (local midnight, not UTC)
        const [y, m, d] = date.split('-').map(Number);
        const startOfDay = new Date(y, m - 1, d, 0, 0, 0, 0);
        const endOfDay = new Date(y, m - 1, d, 23, 59, 59, 999);

        // 1. Regular entries for this teacher on this day (same strategy as getWeeklyTimetable)
        const regularEntries = await this.prisma.timetableEntry.findMany({
            where: {
                schoolId,
                academicYearId: resolvedYearId,
                teacherId,
                day: dayOfWeek,
                status: { in: ['PUBLISHED', 'LOCKED'] },
            },
            include: {
                group: { select: { id: true, name: true } },
                subject: { select: { id: true, name: true, code: true, color: true } },
                timeSlot: { include: { period: true } },
                room: { select: { id: true, name: true } },
            },
            orderBy: { timeSlot: { startTime: 'asc' } },
        });

        // 2. Assignment map for assignmentId resolution
        const assignments = await this.prisma.subjectAssignment.findMany({
            where: { schoolId, teacherId, isActive: true, academicYearId: resolvedYearId },
            select: { id: true, groupId: true, subjectId: true },
        });
        const getAssignmentId = (groupId: number, subjectId: number) =>
            assignments.find(a => a.groupId === groupId && a.subjectId === subjectId)?.id;

        // 3. Overrides affecting my classes today
        const myOverrides = await this.prisma.timetableOverride.findMany({
            where: {
                schoolId,
                academicYearId: resolvedYearId,
                date: { gte: startOfDay, lte: endOfDay },
                entry: { teacherId },
            },
            include: {
                substituteTeacher: { select: { id: true, user: { select: { name: true } } } },
            },
        });

        // 4. Classes I am covering for someone else today
        const substitutionDuties = await this.prisma.timetableOverride.findMany({
            where: {
                schoolId,
                academicYearId: resolvedYearId,
                date: { gte: startOfDay, lte: endOfDay },
                substituteTeacherId: teacherId,
                type: TimetableOverrideType.SUBSTITUTE,
            },
            include: {
                entry: {
                    include: {
                        group: { select: { id: true, name: true } },
                        subject: { select: { id: true, name: true, code: true, color: true } },
                        timeSlot: { include: { period: true } },
                        room: { select: { id: true, name: true } },
                        teacher: { select: { id: true, user: { select: { name: true } } } },
                    },
                },
                substituteRoom: { select: { id: true, name: true } },
            },
        });

        // 5. Build result — regular entries with override status applied
        const result: any[] = regularEntries.map(entry => {
            const override = myOverrides.find(o => o.entryId === entry.id);
            const assignmentId = getAssignmentId(entry.groupId, entry.subjectId!);
            if (override) {
                return this.mapEntry({
                    ...entry,
                    status: override.type === TimetableOverrideType.CANCELLED ? 'CANCELLED' : 'SUBSTITUTED',
                    overrideNote: override.note,
                    substituteTeacher: override.substituteTeacher,
                    assignmentId,
                });
            }
            return this.mapEntry({ ...entry, status: 'REGULAR', assignmentId });
        });

        // 6. Append substitution duties not already in my regular slot
        for (const sub of substitutionDuties) {
            if (!regularEntries.some(e => e.timeSlotId === sub.entry.timeSlotId)) {
                result.push(this.mapEntry({
                    ...sub.entry,
                    id: `sub-${sub.id}`,
                    status: 'SUBSTITUTION_DUTY',
                    room: sub.substituteRoom || sub.entry.room,
                    originalTeacher: sub.entry.teacher,
                    note: sub.note,
                    assignmentId: getAssignmentId(sub.entry.groupId, sub.entry.subjectId!),
                }));
            }
        }

        // 7. Sort by period start time numerically
        return result.sort((a: any, b: any) => {
            const parseMins = (time: string) => {
                if (!time) return 0;
                const [h, m] = time.trim().split(' ')[0].split(':').map(Number);
                return (h || 0) * 60 + (m || 0);
            };
            return parseMins(a.period?.startTime) - parseMins(b.period?.startTime);
        });
    }

    async getSubstitutions(schoolId: number, userId: number, academicYearId?: number) {
        const resolvedYearId = await this.resolveAcademicYearId(schoolId, academicYearId);
        const teacherId = await this.getTeacherIdFromUser(userId);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const subs = await this.prisma.timetableOverride.findMany({
            where: {
                schoolId,
                academicYearId: resolvedYearId,
                substituteTeacherId: teacherId,
                date: { gte: today }
            },
            include: {
                entry: {
                    include: {
                        group: { select: { id: true, name: true } },
                        subject: { select: { id: true, name: true, code: true, color: true } },
                        timeSlot: { include: { period: true } },
                        room: { select: { id: true, name: true } },
                    }
                }
            },
            orderBy: { date: 'asc' }
        });

        return subs.map(s => ({
            ...s,
            entry: this.mapEntry(s.entry)
        }));
    }

    async getTimetableRange(schoolId: number, userId: number, academicYearId: number | undefined, fromDate: string, toDate: string) {
        const resolvedYearId = await this.resolveAcademicYearId(schoolId, academicYearId);
        const teacherId = await this.getTeacherIdFromUser(userId);

        const start = new Date(fromDate);
        const end = new Date(toDate);
        // Ensure end date covers the full day
        end.setUTCHours(23, 59, 59, 999);
        const days: any[] = [];

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            days.push(new Date(d));
        }

        // Fetch all potential data in bulk to optimize?
        // For now, let's iterate to reuse logic or just implement bulk logic?
        // Bulk logic is better.

        // 1. Fetch all regular entries for this teacher
        // (We need to filter by day of week for each day in range, effectively all entries if range covers a week)
        const allEntries = await this.prisma.timetableEntry.findMany({
            where: { 
                schoolId, 
                academicYearId: resolvedYearId, 
                teacherId,
                status: { in: ['PUBLISHED', 'LOCKED'] },
            },
            include: {
                group: { select: { id: true, name: true } },
                subject: { select: { id: true, name: true, code: true, color: true } },
                timeSlot: { include: { period: true } },
                room: { select: { id: true, name: true } },
            },
        });

        // 2. Fetch all overrides for this range for this teacher
        const myOverrides = await this.prisma.timetableOverride.findMany({
            where: {
                schoolId,
                academicYearId: resolvedYearId,
                entry: { teacherId },
                date: { gte: start, lte: end },
            },
            include: {
                substituteTeacher: { select: { id: true, user: { select: { name: true } } } }
            }
        });

        // 3. Fetch substitutions I am doing
        const substitutions = await this.prisma.timetableOverride.findMany({
            where: {
                schoolId,
                academicYearId: resolvedYearId,
                substituteTeacherId: teacherId,
                date: { gte: start, lte: end },
            },
            include: {
                entry: {
                    include: {
                        group: { select: { id: true, name: true } },
                        subject: { select: { id: true, name: true, code: true, color: true } },
                        timeSlot: { include: { period: true } },
                        room: { select: { id: true, name: true } },
                        teacher: { select: { id: true, user: { select: { name: true } } } }
                    }
                },
                substituteRoom: { select: { id: true, name: true } }
            }
        });

        const result: Record<string, any[]> = {};
        const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

        for (const dateObj of days) {
            const dateStr = dateObj.toISOString().split('T')[0];
            const dayName = dayNames[dateObj.getDay()] as DayOfWeek;

            // Filter entries for this day
            const dailyEntries = allEntries.filter(e => e.day === dayName).map(entry => {
                const override = myOverrides.find(o => o.entryId === entry.id && o.date.toISOString().split('T')[0] === dateStr);
                if (override) {
                    return {
                        ...entry,
                        status: override.type === TimetableOverrideType.CANCELLED ? 'CANCELLED' : 'SUBSTITUTED',
                        overrideNote: override.note,
                        substituteTeacher: override.substituteTeacher
                    };
                }
                return { ...entry, status: 'REGULAR' };
            });

            // Add substitutions
            const dailySubs = substitutions
                .filter(s => s.date.toISOString().split('T')[0] === dateStr)
                .map(sub => ({
                    ...sub.entry,
                    id: `sub-${sub.id}`,
                    originalEntryId: sub.entry.id,
                    status: 'SUBSTITUTION_DUTY',
                    room: sub.substituteRoom || sub.entry.room,
                    originalTeacher: sub.entry.teacher,
                    note: sub.note
                }));

            const combined = [...dailyEntries, ...dailySubs].map(e => this.mapEntry(e)).sort((a: any, b: any) => {
                const parseMins = (time: string) => {
                    if (!time) return 0;
                    const [h, m] = time.trim().split(' ')[0].split(':').map(Number);
                    return (h || 0) * 60 + (m || 0);
                };
                return parseMins(a.period?.startTime) - parseMins(b.period?.startTime);
            });
            result[dateStr] = combined;
        }

        return result;
    }

    async getNextClassDate(schoolId: number, userId: number, groupId: number, subjectId: number, fromDate: string): Promise<Date> {
        const teacherId = await this.getTeacherIdFromUser(userId);
        const entries = await this.prisma.timetableEntry.findMany({
            where: { 
                schoolId, 
                teacherId, 
                groupId, 
                subjectId,
                status: { in: ['PUBLISHED', 'LOCKED'] },
            },
            select: { day: true }
        });

        if (entries.length === 0) {
            const nextDay = new Date(fromDate);
            nextDay.setDate(nextDay.getDate() + 1);
            return nextDay;
        }

        const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
        const scheduledDays = entries.map(e => dayNames.indexOf(e.day));

        const start = new Date(fromDate);
        for (let i = 1; i <= 7; i++) {
            const current = new Date(start);
            current.setDate(start.getDate() + i);
            if (scheduledDays.includes(current.getDay())) {
                return current;
            }
        }

        const fallback = new Date(fromDate);
        fallback.setDate(fallback.getDate() + 1);
        return fallback;
    }
}
