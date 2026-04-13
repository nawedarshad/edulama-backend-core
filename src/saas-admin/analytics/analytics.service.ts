import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as os from 'os';

@Injectable()
export class AnalyticsService {
    constructor(private prisma: PrismaService) { }

    async getOverviewStats(startDate?: Date, endDate?: Date) {
        const dateFilter: any = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.gte = startDate;
            if (endDate) dateFilter.createdAt.lte = endDate;
        }

        const [
            totalSchools,
            newSchools,
            totalStudents,
            newStudents,
            totalTeachers,
            totalUsers
        ] = await Promise.all([
            this.prisma.school.count(),
            this.prisma.school.count({ where: dateFilter }),
            this.prisma.studentProfile.count(),
            this.prisma.studentProfile.count({ where: dateFilter }),
            this.prisma.teacherProfile.count(),
            this.prisma.user.count()
        ]);

        return {
            platform: {
                totalSchools,
                newSchoolsInPeriod: newSchools,
                totalUsers,
                totalStudents,
                totalTeachers,
            },
            period: {
                startDate,
                endDate
            }
        };
    }

    async getHistoricalData(type: 'schools' | 'students', months: number = 6) {
        const history: { month: string; count: number; timestamp: string }[] = [];
        const now = new Date();

        for (let i = 0; i < months; i++) {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);

            const count = await (type === 'schools' 
                ? this.prisma.school.count({ where: { createdAt: { gte: startOfMonth, lte: endOfMonth } } })
                : this.prisma.studentProfile.count({ where: { createdAt: { gte: startOfMonth, lte: endOfMonth } } }));

            history.unshift({
                month: startOfMonth.toLocaleString('default', { month: 'short', year: 'numeric' }),
                count,
                timestamp: startOfMonth.toISOString()
            });
        }

        return history;
    }

    async getActivityStats(limit: number = 10) {
        const logs = await this.prisma.auditLog.findMany({
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
                school: { select: { name: true } },
                user: { select: { name: true } }
            }
        });

        return logs.map(log => ({
            id: log.id.toString(),
            school: log.school.name,
            user: log.user?.name || 'System',
            entity: log.entity,
            action: log.action,
            timestamp: log.createdAt
        }));
    }

    async getModuleStats() {
        const modules = await this.prisma.module.findMany({
            include: {
                _count: {
                    select: { schoolModules: { where: { enabled: true } } }
                }
            }
        });

        return modules.map(m => ({
            key: m.key,
            name: m.name,
            activeInstallations: m._count.schoolModules
        })).sort((a, b) => b.activeInstallations - a.activeInstallations);
    }

    getSystemHealth() {
        return {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            platform: os.platform(),
            release: os.release(),
            arch: os.arch(),
            nodeVersion: process.version,
            serverTime: new Date().toISOString()
        };
    }
}
