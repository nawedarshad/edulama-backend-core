import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { DayOfWeek } from '@prisma/client';

const DAYS = Object.values(DayOfWeek);

@Injectable()
export class TimetableAnalyticsService {
    constructor(
        private readonly prisma: PrismaService,
        @Inject(CACHE_MANAGER) private cacheManager: Cache
    ) { }

    private async ensureAcademicYear(schoolId: number, academicYearId: number): Promise<number> {
        if (academicYearId) return academicYearId;
        const activeYear = await this.prisma.academicYear.findFirst({
            where: { schoolId, status: 'ACTIVE' },
        });
        if (!activeYear) {
            throw new BadRequestException("No active academic year found for this school.");
        }
        return activeYear.id;
    }

    async getTeacherWorkloadAnalytics(schoolId: number, academicYearId: number) {
        academicYearId = await this.ensureAcademicYear(schoolId, academicYearId);

        const workload = await this.prisma.timetableEntry.groupBy({
            by: ['teacherId'],
            where: { schoolId, academicYearId, teacherId: { not: null } },
            _count: { _all: true },
        });

        const teachers = await this.prisma.teacherProfile.findMany({
            where: { id: { in: workload.map(w => w.teacherId as number) }, schoolId },
            select: { id: true, user: { select: { name: true } } }
        });

        return workload.map(w => {
            const teacher = teachers.find(t => t.id === w.teacherId);
            return {
                id: w.teacherId,
                name: teacher?.user?.name || 'Unknown',
                totalPeriods: w._count._all,
                utilizationRate: 0 // Will be calculated if needed
            };
        });
    }

    async getGroupSubjectDistribution(schoolId: number, academicYearId: number, groupId: number) {
        const distribution = await this.prisma.timetableEntry.groupBy({
            by: ['subjectId'],
            where: { schoolId, academicYearId, groupId, subjectId: { not: null } },
            _count: { _all: true },
        });

        const subjects = await this.prisma.subject.findMany({
            where: { id: { in: distribution.map(d => d.subjectId as number) }, schoolId },
            select: { id: true, name: true }
        });

        return distribution.map(d => {
            const subject = subjects.find(s => s.id === d.subjectId);
            return {
                id: d.subjectId,
                name: subject?.name || 'Unknown',
                totalPeriods: d._count._all
            };
        });
    }

    async getAnalyticsData(schoolId: number, academicYearId: number) {
        academicYearId = await this.ensureAcademicYear(schoolId, academicYearId);
        const cacheKey = `timetable_analytics_${schoolId}_${academicYearId}`;
        const cachedData = await this.cacheManager.get(cacheKey);
        if (cachedData) return cachedData;

        // 1. Fetch minimal fields needed for summary and charts
        const entries = await this.prisma.timetableEntry.findMany({
            where: { schoolId, academicYearId },
            select: {
                day: true,
                teacherId: true,
                subjectId: true,
                groupId: true,
                roomId: true
            }
        });

        if (entries.length === 0) {
            return {
                summary: {
                    totalEntries: 0,
                    teachingPeriods: 0,
                    totalTeachers: 0,
                    averagePeriodsPerTeacher: 0,
                    totalSubjects: 0,
                    totalGroups: 0,
                    totalRooms: 0
                },
                teacherWorkload: [],
                subjectDistribution: [],
                roomUtilization: [],
                groupCoverage: [],
                dayWiseDistribution: {}
            };
        }

        // 2. Optimized Summary & Distributions (Single Pass O(n))
        const teacherCounts = new Map<number, number>();
        const subjectCounts = new Map<number, number>();
        const roomCounts = new Map<number, number>();
        const groupCounts = new Map<number, number>();
        const dayCounts: Record<string, number> = {};

        DAYS.forEach(d => dayCounts[d] = 0);

        for (const e of entries) {
            dayCounts[e.day] = (dayCounts[e.day] || 0) + 1;
            if (e.teacherId) teacherCounts.set(e.teacherId, (teacherCounts.get(e.teacherId) || 0) + 1);
            if (e.subjectId) subjectCounts.set(e.subjectId, (subjectCounts.get(e.subjectId) || 0) + 1);
            if (e.roomId) roomCounts.set(e.roomId, (roomCounts.get(e.roomId) || 0) + 1);
            if (e.groupId) groupCounts.set(e.groupId, (groupCounts.get(e.groupId) || 0) + 1);
        }

        // 3. Get metadata for entities
        const [teachers, subjects, rooms, groups] = await Promise.all([
            this.prisma.teacherProfile.findMany({
                where: { id: { in: Array.from(teacherCounts.keys()) }, schoolId },
                select: { id: true, user: { select: { name: true } } }
            }),
            this.prisma.subject.findMany({
                where: { id: { in: Array.from(subjectCounts.keys()) }, schoolId },
                select: { id: true, name: true }
            }),
            this.prisma.room.findMany({
                where: { id: { in: Array.from(roomCounts.keys()) }, schoolId },
                select: { id: true, name: true }
            }),
            this.prisma.academicGroup.findMany({
                where: { id: { in: Array.from(groupCounts.keys()) }, schoolId },
                select: { id: true, name: true }
            })
        ]);

        // 4. Working days for utilization
        const workingDaysCount = await this.prisma.workingPattern.count({
            where: { schoolId, isWorking: true }
        }) || 5;

        const maxPeriodsPerDay = 8; // Should fetch from settings in production
        const totalPossibleSlots = workingDaysCount * maxPeriodsPerDay;

        const result = {
            summary: {
                totalEntries: entries.length,
                teachingPeriods: entries.length,
                totalTeachers: teacherCounts.size,
                averagePeriodsPerTeacher: (entries.length / (teacherCounts.size || 1)).toFixed(1),
                totalSubjects: subjectCounts.size,
                totalGroups: groupCounts.size,
                totalRooms: roomCounts.size
            },
            teacherWorkload: teachers.map(t => ({
                id: t.id,
                name: t.user?.name || 'Unknown',
                totalPeriods: teacherCounts.get(t.id) || 0,
                utilizationRate: (((teacherCounts.get(t.id) || 0) / totalPossibleSlots) * 100).toFixed(1)
            })),
            subjectDistribution: subjects.map(s => ({
                id: s.id,
                name: s.name,
                totalPeriods: subjectCounts.get(s.id) || 0
            })),
            roomUtilization: rooms.map(r => ({
                id: r.id,
                name: r.name,
                totalBookings: roomCounts.get(r.id) || 0,
                utilizationRate: (((roomCounts.get(r.id) || 0) / totalPossibleSlots) * 100).toFixed(1)
            })),
            groupCoverage: groups.map(g => ({
                id: g.id,
                name: g.name,
                totalPeriods: groupCounts.get(g.id) || 0,
                coverageRate: (((groupCounts.get(g.id) || 0) / totalPossibleSlots) * 100).toFixed(1)
            })),
            dayWiseDistribution: dayCounts
        };

        await this.cacheManager.set(cacheKey, result, 900); // 15 mins
        return result;
    }

    async getComprehensiveAnalytics(schoolId: number, academicYearId: number) {
        academicYearId = await this.ensureAcademicYear(schoolId, academicYearId);
        const cacheKey = `timetable_comp_analytics_${schoolId}_${academicYearId}`;
        const cachedData = await this.cacheManager.get(cacheKey);
        if (cachedData) return cachedData;

        const result = await this.getAnalyticsData(schoolId, academicYearId);

        await this.cacheManager.set(cacheKey, result, 900);
        return result;
    }
}
