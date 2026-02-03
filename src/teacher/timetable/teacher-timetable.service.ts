import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DayOfWeek, TimetableOverrideType } from '@prisma/client';
import { DateQueryDto } from './dto/date-query.dto';

@Injectable()
export class TeacherTimetableService {
    constructor(private readonly prisma: PrismaService) { }

    private getDayOfWeek(dateString: string): DayOfWeek {
        const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
        const date = new Date(dateString);
        return days[date.getUTCDay()] as DayOfWeek;
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
            },
            include: {
                class: { select: { id: true, name: true } },
                section: { select: { id: true, name: true } },
                subject: { select: { id: true, name: true, code: true, color: true } },
                period: true,
                room: { select: { id: true, name: true } },
            },
            orderBy: [
                { day: 'asc' },
                { period: { startTime: 'asc' } }
            ]
        });

        // Group by day
        const grouped = entries.reduce((acc, entry) => {
            if (!acc[entry.day]) acc[entry.day] = [];
            acc[entry.day].push(entry);
            return acc;
        }, {} as Record<string, typeof entries>);

        return grouped;
    }

    async getDailyTimetable(schoolId: number, userId: number, academicYearId: number | undefined, date: string) {
        const resolvedYearId = await this.resolveAcademicYearId(schoolId, academicYearId);
        const teacherId = await this.getTeacherIdFromUser(userId);

        const dayOfWeek = this.getDayOfWeek(date);
        const dateObj = new Date(date);
        const startOfDay = new Date(dateObj);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(dateObj);
        endOfDay.setUTCHours(23, 59, 59, 999);

        // 0. Fetch ALL Periods for this day
        const allPeriods = await this.prisma.timePeriod.findMany({
            where: {
                schoolId,
                academicYearId: resolvedYearId,
                days: { has: dayOfWeek }
            },
            orderBy: { startTime: 'asc' }
        });

        // 0.5 Fetch Assignments for ID mapping
        const assignments = await this.prisma.subjectAssignment.findMany({
            where: {
                schoolId,
                teacherId,
                isActive: true,
                academicYearId: resolvedYearId
            },
            select: { id: true, classId: true, sectionId: true, subjectId: true }
        });

        const getAssignmentId = (classId: number, sectionId: number, subjectId: number) => {
            return assignments.find(a =>
                a.classId === classId &&
                a.sectionId === sectionId &&
                a.subjectId === subjectId
            )?.id;
        };

        // 1. Get Regular Schedule
        const regularEntries = await this.prisma.timetableEntry.findMany({
            where: {
                schoolId,
                academicYearId: resolvedYearId,
                teacherId,
                day: dayOfWeek,
            },
            include: {
                class: { select: { id: true, name: true } },
                section: { select: { id: true, name: true } },
                subject: { select: { id: true, name: true, code: true, color: true } },
                period: true,
                room: { select: { id: true, name: true } },
            },
        });

        // 2. Get Overrides (Cancellations or Substitutions affecting this teacher's regular classes)
        const myOverrides = await this.prisma.timetableOverride.findMany({
            where: {
                schoolId,
                academicYearId: resolvedYearId,
                date: {
                    gte: startOfDay,
                    lte: endOfDay
                },
                entry: { teacherId },
            },
            include: {
                substituteTeacher: { select: { id: true, user: { select: { name: true } } } }
            }
        });

        // 3. Get Substitutions (Classes I am covering for someone else)
        const substitutions = await this.prisma.timetableOverride.findMany({
            where: {
                schoolId,
                academicYearId: resolvedYearId,
                date: {
                    gte: startOfDay,
                    lte: endOfDay
                },
                substituteTeacherId: teacherId,
            },
            include: {
                entry: {
                    include: {
                        class: { select: { id: true, name: true } },
                        section: { select: { id: true, name: true } },
                        subject: { select: { id: true, name: true, code: true, color: true } },
                        period: true,
                        room: { select: { id: true, name: true } },
                        teacher: { select: { id: true, user: { select: { name: true } } } }
                    }
                },
                substituteRoom: { select: { id: true, name: true } }
            }
        });

        // 4. Construct Final Schedule (Map over ALL periods to include FREE slots)
        const finalSchedule = allPeriods.map(period => {
            // Check for substitutions I'm doing in this period
            const substitutionDuty = substitutions.find(sub => sub.entry.periodId === period.id);
            if (substitutionDuty) {
                return {
                    ...substitutionDuty.entry,
                    id: `sub-${substitutionDuty.id}`,
                    originalEntryId: substitutionDuty.entry.id,
                    status: 'SUBSTITUTION_DUTY',
                    room: substitutionDuty.substituteRoom || substitutionDuty.entry.room,
                    originalTeacher: substitutionDuty.entry.teacher,
                    note: substitutionDuty.note,
                    period: period,
                    assignmentId: getAssignmentId(substitutionDuty.entry.classId, substitutionDuty.entry.sectionId, substitutionDuty.entry.subjectId)
                };
            }

            // Check for regular class
            const regularEntry = regularEntries.find(e => e.periodId === period.id);
            if (regularEntry) {
                const override = myOverrides.find(o => o.entryId === regularEntry.id);
                const assignmentId = getAssignmentId(regularEntry.classId, regularEntry.sectionId, regularEntry.subjectId);

                if (override) {
                    return {
                        ...regularEntry,
                        status: override.type === TimetableOverrideType.CANCELLED ? 'CANCELLED' : 'SUBSTITUTED',
                        overrideNote: override.note,
                        substituteTeacher: override.substituteTeacher,
                        assignmentId
                    };
                }
                return { ...regularEntry, status: 'REGULAR', assignmentId };
            }

            // No class = Free Period
            return {
                id: `free-${period.id}`,
                status: 'FREE',
                period: period,
                subject: null,
                class: null,
                section: null,
                room: null
            };
        });

        // Add substitutions I'm doing
        const substitutionEntries = substitutions.map(sub => ({
            ...sub.entry,
            id: `sub-${sub.id}`, // specific ID format for frontend differentiation
            originalEntryId: sub.entry.id,
            status: 'SUBSTITUTION_DUTY',
            room: sub.substituteRoom || sub.entry.room, // Use substituted room if assigned
            originalTeacher: sub.entry.teacher,
            note: sub.note
        }));

        const result = [...finalSchedule, ...substitutionEntries];

        // Sort by time
        return result.sort((a, b) => {
            const timeA = a.period?.startTime || '00:00';
            const timeB = b.period?.startTime || '00:00';
            return timeA.localeCompare(timeB);
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
                        class: { select: { id: true, name: true } },
                        section: { select: { id: true, name: true } },
                        subject: { select: { id: true, name: true, code: true, color: true } },
                        period: true,
                        room: { select: { id: true, name: true } },
                    }
                }
            },
            orderBy: { date: 'asc' }
        });

        return subs;
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
            where: { schoolId, academicYearId: resolvedYearId, teacherId },
            include: {
                class: { select: { id: true, name: true } },
                section: { select: { id: true, name: true } },
                subject: { select: { id: true, name: true, code: true, color: true } },
                period: true,
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
                        class: { select: { id: true, name: true } },
                        section: { select: { id: true, name: true } },
                        subject: { select: { id: true, name: true, code: true, color: true } },
                        period: true,
                        room: { select: { id: true, name: true } },
                        teacher: { select: { id: true, user: { select: { name: true } } } }
                    }
                },
                substituteRoom: { select: { id: true, name: true } }
            }
        });

        const result = {};
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

            const combined = [...dailyEntries, ...dailySubs].sort((a, b) => {
                const timeA = a.period?.startTime || '00:00';
                const timeB = b.period?.startTime || '00:00';
                return timeA.localeCompare(timeB);
            });

            result[dateStr] = combined;
        }

        return result;
    }
}
