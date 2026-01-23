import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AttendanceMonitorService {
    constructor(private readonly prisma: PrismaService) { }

    async assignMonitors(schoolId: number, academicYearId: number, userIds: number[]) {
        // Resolve teacher profiles from user IDs
        const teachers = await this.prisma.teacherProfile.findMany({
            where: {
                userId: { in: userIds },
                schoolId,
            },
            select: { id: true, userId: true },
        });

        const validTeacherIds = teachers.map((t) => t.id);

        if (validTeacherIds.length === 0) {
            throw new NotFoundException('No valid teachers found for the provided user IDs');
        }

        // Create monitor entries
        await this.prisma.lateAttendanceMonitor.createMany({
            data: validTeacherIds.map((teacherId) => ({
                schoolId,
                academicYearId,
                teacherId,
            })),
            skipDuplicates: true,
        });

        return { message: 'Monitors assigned successfully', assignedCount: validTeacherIds.length };
    }

    async getMonitors(schoolId: number, academicYearId: number) {
        const monitors = await this.prisma.lateAttendanceMonitor.findMany({
            where: { schoolId, academicYearId },
            include: {
                teacher: {
                    include: {
                        user: {
                            select: { name: true, photo: true }
                        },
                        personalInfo: {
                            select: { fullName: true, email: true, phone: true }
                        }
                    },
                },
            },
            orderBy: { assignedAt: 'desc' },
        });

        return monitors.map((m) => ({
            id: m.id,
            teacherId: m.teacherId,
            userId: m.teacher.userId,
            name: m.teacher.personalInfo?.fullName || m.teacher.user.name,
            email: m.teacher.personalInfo?.email,
            phone: m.teacher.personalInfo?.phone,
            photo: m.teacher.user.photo,
            assignedAt: m.assignedAt,
        }));
    }

    async removeMonitor(schoolId: number, academicYearId: number, teacherId: number) {
        // Use deleteMany to avoid error if not exists, or findFirst then delete
        const deleted = await this.prisma.lateAttendanceMonitor.deleteMany({
            where: {
                schoolId,
                academicYearId,
                teacherId,
            },
        });

        if (deleted.count === 0) {
            throw new NotFoundException('Monitor not found or already removed');
        }

        return { message: 'Monitor removed successfully' };
    }
}
