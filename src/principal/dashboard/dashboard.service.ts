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

        const today = new Date();
        const startOfToday = new Date(today.setHours(0, 0, 0, 0));
        const endOfToday = new Date(today.setHours(23, 59, 59, 999));
        // Reset ranges for comparisons
        const ranges = this.getDateRanges();

        if (!academicYear) {
            return {
                totalStudents: 0,
                studentTrend: { value: 0, isPositive: true },
                presentToday: 0,
                absentToday: 0,
                lateToday: 0,
                leaveToday: 0,
                attendancePercentage: 0,
                attendanceTrend: { value: 0, isPositive: true },
                teacherCount: 0,
                teacherTrend: { value: 0, isPositive: true },
                teacherPresentToday: 0,
                teacherAbsentToday: 0,
                teacherLeaveToday: 0,
                teacherLateToday: 0,
                teacherAttendancePercentage: 0,
                teacherAttendanceTrend: { value: 0, isPositive: true },
                pendingLeaves: 0,
                classWiseAttendance: [],
                lateComersToday: [],
                recentAnnouncements: [],
                recentGrievances: [],
                recentInquiries: []
            };
        }

        // 2. Fetch Stats
        const totalStudents = await this.prisma.studentProfile.count({
            where: { schoolId, academicYearId: academicYear.id, isActive: true }
        });

        const teacherCount = await this.prisma.teacherProfile.count({
            where: { schoolId, isActive: true }
        });

        const pendingLeaves = await this.prisma.leaveRequest.count({
            where: { schoolId, status: 'PENDING' }
        });

        // 3. Attendance Aggregations
        const studentAttendanceToday = await this.aggregateStudentAttendance(schoolId, academicYear.id, startOfToday, endOfToday);
        const teacherAttendanceToday = await this.aggregateTeacherAttendance(schoolId, academicYear.id, startOfToday, endOfToday);

        // 4. Trend Calculations
        // Student Attendance Trend (This Week vs Last Week)
        const lastWeekStart = new Date(ranges.week.start);
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);
        const lastWeekEnd = new Date(ranges.week.end);
        lastWeekEnd.setDate(lastWeekEnd.getDate() - 7);

        const thisWeekStudentAttendance = await this.aggregateStudentAttendance(schoolId, academicYear.id, ranges.week.start, ranges.week.end);
        const lastWeekStudentAttendance = await this.aggregateStudentAttendance(schoolId, academicYear.id, lastWeekStart, lastWeekEnd);

        const thisWeekAttendancePerc = (thisWeekStudentAttendance.present + thisWeekStudentAttendance.absent) > 0 
            ? (thisWeekStudentAttendance.present / (thisWeekStudentAttendance.present + thisWeekStudentAttendance.absent)) * 100 
            : 0;
        const lastWeekAttendancePerc = (lastWeekStudentAttendance.present + lastWeekStudentAttendance.absent) > 0 
            ? (lastWeekStudentAttendance.present / (lastWeekStudentAttendance.present + lastWeekStudentAttendance.absent)) * 100 
            : 0;
        
        const attendanceTrendValue = Math.abs(parseFloat((thisWeekAttendancePerc - lastWeekAttendancePerc).toFixed(1)));

        // Teacher Attendance Trend
        const thisWeekTeacherAttendance = await this.aggregateTeacherAttendance(schoolId, academicYear.id, ranges.week.start, ranges.week.end);
        const lastWeekTeacherAttendance = await this.aggregateTeacherAttendance(schoolId, academicYear.id, lastWeekStart, lastWeekEnd);

        const thisWeekTeacherPerc = (thisWeekTeacherAttendance.present + thisWeekTeacherAttendance.absent) > 0 
            ? (thisWeekTeacherAttendance.present / (thisWeekTeacherAttendance.present + thisWeekTeacherAttendance.absent)) * 100 
            : 0;
        const lastWeekTeacherPerc = (lastWeekTeacherAttendance.present + lastWeekTeacherAttendance.absent) > 0 
            ? (lastWeekTeacherAttendance.present / (lastWeekTeacherAttendance.present + lastWeekTeacherAttendance.absent)) * 100 
            : 0;

        const teacherAttendanceTrendValue = Math.abs(parseFloat((thisWeekTeacherPerc - lastWeekTeacherPerc).toFixed(1)));

        // Student Growth Trend (Current vs Previous Month Start)
        const studentsLastMonth = await this.prisma.studentProfile.count({
            where: { schoolId, academicYearId: academicYear.id, isActive: true, createdAt: { lt: ranges.month.start } }
        });
        const studentTrendValue = studentsLastMonth > 0 
            ? parseFloat(((totalStudents - studentsLastMonth) / studentsLastMonth * 100).toFixed(1)) 
            : 0;

        // Teacher Growth Trend (Current vs Previous Month Start)
        const teachersLastMonth = await this.prisma.teacherProfile.count({
            where: { schoolId, isActive: true, createdAt: { lt: ranges.month.start } }
        });
        const teacherTrendValue = teachersLastMonth > 0 
            ? parseFloat(((teacherCount - teachersLastMonth) / teachersLastMonth * 100).toFixed(1)) 
            : 0;

        const attendancePercentage = totalStudents > 0 ? parseFloat(((studentAttendanceToday.present / totalStudents) * 100).toFixed(1)) : 0;
        const teacherAttendancePercentage = teacherCount > 0 ? parseFloat(((teacherAttendanceToday.present / teacherCount) * 100).toFixed(1)) : 0;

        const pendingTasks = await this.prisma.task.count({
            where: { schoolId, status: { not: 'COMPLETED' } }
        });

        return {
            totalStudents,
            studentTrend: { value: Math.abs(studentTrendValue), isPositive: studentTrendValue >= 0 },
            presentToday: studentAttendanceToday.present,
            absentToday: studentAttendanceToday.absent,
            lateToday: studentAttendanceToday.late,
            leaveToday: studentAttendanceToday.excused,
            attendancePercentage,
            attendanceTrend: { value: attendanceTrendValue, isPositive: thisWeekAttendancePerc >= lastWeekAttendancePerc },

            teacherCount,
            teacherTrend: { value: Math.abs(teacherTrendValue), isPositive: teacherTrendValue >= 0 },
            teacherPresentToday: teacherAttendanceToday.present,
            teacherAbsentToday: teacherAttendanceToday.absent,
            teacherLeaveToday: teacherAttendanceToday.excused,
            teacherLateToday: teacherAttendanceToday.late,
            teacherAttendancePercentage,
            teacherAttendanceTrend: { value: teacherAttendanceTrendValue, isPositive: thisWeekTeacherPerc >= lastWeekTeacherPerc },

            pendingLeaves,
            pendingTasks,

            teacher: {
                ...(await this.getTeacherTrends(schoolId, academicYear?.id)),
                weeklyBreakdown: await this.getTeacherWeeklyBreakdown(schoolId, academicYear?.id)
            },
            student: await this.getStudentTrends(schoolId, academicYear.id),
            classWiseAttendance: await this.getClassWiseAttendance(schoolId, academicYear.id, startOfToday, endOfToday),
            lateComersToday: await this.getLateComersToday(schoolId, academicYear.id, startOfToday, endOfToday),
            recentAnnouncements: await this.getRecentAnnouncements(schoolId),
            recentGrievances: await this.getRecentGrievances(schoolId),
            recentPendingLeaves: await this.getRecentPendingLeaves(schoolId),
            recentInquiries: await this.getRecentInquiries(schoolId),
            recentTasks: await this.getRecentTasks(schoolId)
        };
    }

    private async getRecentPendingLeaves(schoolId: number) {
        return this.prisma.leaveRequest.findMany({
            where: { schoolId, status: 'PENDING' },
            orderBy: { createdAt: 'desc' },
            take: 5,
            include: {
                applicant: { select: { name: true, photo: true } }
            }
        });
    }

    private async getRecentAnnouncements(schoolId: number) {
        return this.prisma.announcement.findMany({
            where: { schoolId },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: { id: true, title: true, createdAt: true, priority: true }
        });
    }

    private async getRecentGrievances(schoolId: number) {
        return this.prisma.grievance.findMany({
            where: { schoolId, status: 'OPEN' },
            orderBy: { createdAt: 'desc' },
            take: 5,
            include: { raisedBy: { select: { name: true, photo: true } } }
        });
    }

    private async getRecentInquiries(schoolId: number) {
        return this.prisma.inquiry.findMany({
            where: { schoolId, status: 'PENDING' },
            orderBy: { createdAt: 'desc' },
            take: 5
        });
    }

    private async getRecentTasks(schoolId: number) {
        return this.prisma.task.findMany({
            where: { schoolId, status: { not: 'COMPLETED' } },
            orderBy: { createdAt: 'desc' },
            take: 5,
            include: {
                assignee: { select: { name: true, photo: true } },
                creator: { select: { name: true, photo: true } }
            }
        });
    }

    private async getClassWiseAttendance(schoolId: number, academicYearId: number, start: Date, end: Date) {
        const classes = await this.prisma.class.findMany({
            where: { schoolId, academicYearId },
            select: { id: true, name: true }
        });

        const results: any[] = [];
        for (const cls of classes) {
            const totalStudents = await this.prisma.studentProfile.count({
                where: { schoolId, academicYearId, classId: cls.id, isActive: true }
            });

            const presentCount = await this.prisma.attendance.count({
                where: {
                    schoolId,
                    status: { in: ['PRESENT', 'LATE'] },
                    session: {
                        classId: cls.id,
                        academicYearId,
                        date: { gte: start, lte: end }
                    }
                }
            });

            results.push({
                className: cls.name,
                total: totalStudents,
                present: presentCount,
                percentage: totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0
            });
        }
        return results.sort((a, b) => b.percentage - a.percentage);
    }

    private async getLateComersToday(schoolId: number, academicYearId: number, start: Date, end: Date) {
        // Students
        const lateStudentAttendances = await this.prisma.attendance.findMany({
            where: {
                schoolId,
                status: 'LATE',
                session: {
                    academicYearId,
                    date: { gte: start, lte: end }
                }
            },
            include: {
                studentProfile: {
                    include: { user: { select: { name: true, photo: true } } }
                },
                session: { include: { class: { select: { name: true } }, section: { select: { name: true } } } }
            },
            take: 10,
            orderBy: { lateMarkedAt: 'desc' }
        });

        // Staff
        const lateStaffAttendances = await this.prisma.staffAttendance.findMany({
            where: {
                schoolId,
                academicYearId,
                status: 'LATE',
                date: { gte: start, lte: end }
            },
            include: {
                teacher: {
                    include: { user: { select: { name: true, photo: true } } }
                }
            },
            take: 5,
            orderBy: { createdAt: 'desc' }
        });

        const studentList = lateStudentAttendances.map(a => ({
            name: a.studentProfile.fullName || a.studentProfile.user?.name || 'Unknown',
            photo: a.studentProfile.user?.photo,
            type: 'STUDENT',
            class: `${a.session.class?.name || ''} - ${a.session.section?.name || ''}`,
            time: a.lateMarkedAt || a.createdAt,
            reason: a.lateReason
        }));

        const staffList = lateStaffAttendances.map(a => ({
            name: a.teacher?.user?.name || 'Unknown',
            photo: a.teacher?.user?.photo,
            type: 'STAFF',
            class: 'Faculty',
            time: a.createdAt, // Or lateMarkedAt if you add it
            reason: ''
        }));

        return [...studentList, ...staffList].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
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
            // If late, they are also present
            present: (map['PRESENT'] || 0) + (map['LATE'] || 0),
            absent: map['ABSENT'] || 0,
            late: map['LATE'] || 0,
            excused: map['EXCUSED'] || 0
        };
    }

    async getWeeklyAttendanceAnalytics(schoolId: number) {
        const academicYear = await this.prisma.academicYear.findFirst({
            where: { schoolId, status: 'ACTIVE' }
        });
        if (!academicYear) return [];

        const ranges = this.getDateRanges();
        const studentStats = await this.getStudentWeeklyBreakdown(schoolId, academicYear.id, ranges.week.start, ranges.week.end);
        const teacherStats = await this.getTeacherWeeklyBreakdown(schoolId, academicYear.id);

        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return days.map(dayName => {
            const studentDay = studentStats.find(s => {
                const date = new Date(s.date);
                return date.toLocaleDateString('en-US', { weekday: 'short' }) === dayName;
            });
            const teacherDay = teacherStats.find(t => {
                const date = new Date(t.date);
                return date.toLocaleDateString('en-US', { weekday: 'short' }) === dayName;
            });

            const studentTotal = (studentDay?.present || 0) + (studentDay?.absent || 0) + (studentDay?.late || 0) + (studentDay?.excused || 0);
            const teacherTotal = (teacherDay?.present || 0) + (teacherDay?.absent || 0) + (teacherDay?.late || 0) + (teacherDay?.excused || 0);

            const studentPerc = studentTotal > 0 ? Math.round(((studentDay.present + studentDay.late) / studentTotal) * 100) : 0;
            const teacherPerc = teacherTotal > 0 ? Math.round(((teacherDay.present + teacherDay.late) / teacherTotal) * 100) : 0;

            return {
                name: dayName,
                Student: studentPerc,
                Teacher: teacherPerc
            };
        });
    }
}
