import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
    private readonly logger = new Logger(DashboardService.name);

    constructor(private readonly prisma: PrismaService) { }

    async getStats(schoolId: number) {
        this.logger.log(`Fetching dashboard stats for school ${schoolId}`);

        // 1. Get Active Academic Year
        const academicYear = await this.prisma.academicYear.findFirst({
            where: { schoolId, status: 'ACTIVE' }
        });

        if (!academicYear) {
            return {
                totalStudents: 0,
                presentToday: 0,
                absentToday: 0,
                lateToday: 0,
                leaveToday: 0
            };
        }

        const today = new Date();
        const startOfDay = new Date(today.setHours(0, 0, 0, 0));
        const endOfDay = new Date(today.setHours(23, 59, 59, 999));

        // 2. Fetch Stats using Prisma Aggregations or Counts
        // Total Active Students
        const totalStudents = await this.prisma.studentProfile.count({
            where: {
                schoolId,
                academicYearId: academicYear.id,
                isActive: true
            }
        });

        // Attendance Stats for Today
        // Using 'Attendance' model
        const attendanceStats = await this.prisma.attendance.groupBy({
            by: ['status'],
            where: {
                session: {
                    schoolId,
                    academicYearId: academicYear.id,
                    date: {
                        gte: startOfDay,
                        lte: endOfDay
                    }
                }
            },
            _count: {
                status: true
            }
        });

        const statsMap = attendanceStats.reduce((acc, curr) => {
            acc[curr.status] = curr._count.status;
            return acc;
        }, {} as Record<string, number>);



        // 3. Additional Metrics
        const teacherCount = await this.prisma.teacherProfile.count({
            where: { schoolId, isActive: true }
        });

        const pendingLeaves = await this.prisma.leaveRequest.count({
            where: {
                schoolId,
                status: 'PENDING' // Requests waiting for Principal
            }
        });

        // Teacher Attendance Stats
        const teacherAttendanceStats = await this.prisma.staffAttendance.groupBy({
            by: ['status'],
            where: {
                schoolId,
                academicYearId: academicYear?.id,
                date: {
                    gte: startOfDay,
                    lte: endOfDay
                }
            },
            _count: { status: true }
        });

        const teacherStatsMap = teacherAttendanceStats.reduce((acc, curr) => {
            acc[curr.status] = curr._count.status;
            return acc;
        }, {} as Record<string, number>);

        const teacherPresent = teacherStatsMap['PRESENT'] || 0;
        const teacherAbsent = teacherStatsMap['ABSENT'] || 0;
        const teacherExcused = teacherStatsMap['EXCUSED'] || 0;
        const teacherLate = teacherStatsMap['LATE'] || 0;

        const presentCount = statsMap['PRESENT'] || 0;
        const attendancePercentage = totalStudents > 0
            ? parseFloat(((presentCount / totalStudents) * 100).toFixed(2))
            : 0;

        return {
            totalStudents,
            presentToday: presentCount,
            absentToday: statsMap['ABSENT'] || 0,
            lateToday: statsMap['LATE'] || 0,
            leaveToday: statsMap['EXCUSED'] || 0,

            teacherCount,
            attendancePercentage,
            pendingLeaves,

            teacherPresentToday: teacherPresent,
            teacherAbsentToday: teacherAbsent,
            teacherLeaveToday: teacherExcused, // Assuming EXCUSED = Approved Leave
            teacherLateToday: teacherLate,

            teacher: {
                ...(await this.getTeacherTrends(schoolId, academicYear?.id)),
                weeklyBreakdown: await this.getTeacherWeeklyBreakdown(schoolId, academicYear?.id)
            },
            student: await this.getStudentTrends(schoolId, academicYear.id)
        };
    }

    private async getStudentTrends(schoolId: number, academicYearId?: number) {
        if (!academicYearId) return null;
        const ranges = this.getDateRanges();
        return {
            week: await this.aggregateStudentAttendance(schoolId, academicYearId, ranges.week.start, ranges.week.end),
            month: await this.aggregateStudentAttendance(schoolId, academicYearId, ranges.month.start, ranges.month.end),
            prevMonth: await this.aggregateStudentAttendance(schoolId, academicYearId, ranges.prevMonth.start, ranges.prevMonth.end),
            weeklyBreakdown: await this.getStudentWeeklyBreakdown(schoolId, academicYearId, ranges.week.start, ranges.week.end)
        };
    }

    private async getTeacherTrends(schoolId: number, academicYearId?: number) {
        if (!academicYearId) return null;
        const ranges = this.getDateRanges();
        return {
            week: await this.aggregateTeacherAttendance(schoolId, academicYearId, ranges.week.start, ranges.week.end),
            month: await this.aggregateTeacherAttendance(schoolId, academicYearId, ranges.month.start, ranges.month.end),
            prevMonth: await this.aggregateTeacherAttendance(schoolId, academicYearId, ranges.prevMonth.start, ranges.prevMonth.end),
        };
    }

    // --- DAILY BREAKDOWN HELPERS ---

    private async getStudentWeeklyBreakdown(schoolId: number, academicYearId: number, start: Date, end: Date) {
        // 1. Get Sessions for the week
        const sessions = await this.prisma.attendanceSession.findMany({
            where: {
                schoolId,
                academicYearId,
                date: { gte: start, lte: end }
            },
            select: { id: true, date: true }
        });

        if (sessions.length === 0) return [];

        const sessionIds = sessions.map(s => s.id);

        // 2. Group Attendance by Session & Status
        const stats = await this.prisma.attendance.groupBy({
            by: ['attendanceSessionId', 'status'],
            where: {
                attendanceSessionId: { in: sessionIds }
            },
            _count: { status: true }
        });

        // 3. Map to Date
        const dateMap = new Map<string, any>();
        
        // Initialize for all days in range
        const currentDate = new Date(start);
        while (currentDate <= end) {
            const dateKey = currentDate.toISOString().split('T')[0];
            dateMap.set(dateKey, { date: dateKey, present: 0, absent: 0, late: 0, excused: 0 });
            currentDate.setDate(currentDate.getDate() + 1);
        }

        // Initialize map with empty stats for found sessions (in case they are outside range? shouldn't be)
        sessions.forEach(s => {
            const dateKey = s.date.toISOString().split('T')[0];
            if (!dateMap.has(dateKey)) {
                dateMap.set(dateKey, { date: dateKey, present: 0, absent: 0, late: 0, excused: 0 });
            }
        });

        stats.forEach(stat => {
            const session = sessions.find(s => s.id === stat.attendanceSessionId);
            if (session) {
                const dateKey = session.date.toISOString().split('T')[0];
                if (dateMap.has(dateKey)) {
                     const dayStats = dateMap.get(dateKey);
                
                    const count = stat._count.status;
                    if (stat.status === 'PRESENT') dayStats.present += count;
                    else if (stat.status === 'ABSENT') dayStats.absent += count;
                    else if (stat.status === 'LATE') dayStats.late += count;
                    else if (stat.status === 'EXCUSED') dayStats.excused += count;
                }
            }
        });

        return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    }

    private async getTeacherWeeklyBreakdown(schoolId: number, academicYearId: number) {
        const ranges = this.getDateRanges();
        // StaffAttendance has a 'date' field, so we can group by it directly
        const stats = await this.prisma.staffAttendance.groupBy({
            by: ['date', 'status'],
            where: {
                schoolId,
                academicYearId,
                date: { gte: ranges.week.start, lte: ranges.week.end }
            },
            _count: { status: true }
        });

        const dateMap = new Map<string, any>();
        
        // Initialize for all days in range
        const currentDate = new Date(ranges.week.start);
        while (currentDate <= ranges.week.end) {
            const dateKey = currentDate.toISOString().split('T')[0];
            dateMap.set(dateKey, { date: dateKey, present: 0, absent: 0, late: 0, excused: 0 });
            currentDate.setDate(currentDate.getDate() + 1);
        }

        stats.forEach(stat => {
            const dateKey = stat.date.toISOString().split('T')[0];
             if (!dateMap.has(dateKey)) {
                // This might happen if 'stat.date' is outside ranges.week (unlikely due to query) 
                // or if we want to include extra dates found
                dateMap.set(dateKey, { date: dateKey, present: 0, absent: 0, late: 0, excused: 0 });
            }
            const dayStats = dateMap.get(dateKey);
            const count = stat._count.status;

            if (stat.status === 'PRESENT') dayStats.present += count;
            else if (stat.status === 'ABSENT') dayStats.absent += count;
            else if (stat.status === 'LATE') dayStats.late += count;
            else if (stat.status === 'EXCUSED') dayStats.excused += count;
        });

        return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    }

    private getDateRanges() {
        const today = new Date();

        // This Week (Mon-Sun)
        const day = today.getDay(); // 0 (Sun) - 6 (Sat)
        const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is sunday
        const startOfWeek = new Date(today);
        startOfWeek.setDate(diff);
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        // This Month
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        endOfMonth.setHours(23, 59, 59, 999);

        // Prev Month
        const startOfPrevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const endOfPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
        endOfPrevMonth.setHours(23, 59, 59, 999);

        return {
            week: { start: startOfWeek, end: endOfWeek },
            month: { start: startOfMonth, end: endOfMonth },
            prevMonth: { start: startOfPrevMonth, end: endOfPrevMonth }
        };
    }

    private async aggregateStudentAttendance(schoolId: number, academicYearId: number, start: Date, end: Date) {
        const stats = await this.prisma.attendance.groupBy({
            by: ['status'],
            where: {
                session: {
                    schoolId,
                    academicYearId,
                    date: { gte: start, lte: end }
                }
            },
            _count: { status: true }
        });
        return this.mapStats(stats);
    }

    private async aggregateTeacherAttendance(schoolId: number, academicYearId: number, start: Date, end: Date) {
        const stats = await this.prisma.staffAttendance.groupBy({
            by: ['status'],
            where: {
                schoolId,
                academicYearId,
                date: { gte: start, lte: end }
            },
            _count: { status: true }
        });
        return this.mapStats(stats);
    }

    private mapStats(stats: any[]) {
        const map = stats.reduce((acc, curr) => {
            acc[curr.status] = curr._count.status;
            return acc;
        }, {} as Record<string, number>);

        return {
            present: map['PRESENT'] || 0,
            absent: map['ABSENT'] || 0,
            late: map['LATE'] || 0,
            excused: map['EXCUSED'] || 0
        };
    }
}
