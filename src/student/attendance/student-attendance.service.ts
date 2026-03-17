import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StudentAttendanceService {
    constructor(private readonly prisma: PrismaService) { }

    async getStudentAttendance(userId: number, schoolId: number, month: number, year: number) {
        const student = await this.prisma.studentProfile.findFirst({
            where: { userId, schoolId },
        });

        if (!student) {
            throw new NotFoundException('Student profile not found');
        }

        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59, 999);

        const attendanceRecords = await this.prisma.attendance.findMany({
            where: {
                studentProfileId: student.id,
                schoolId: schoolId,
                session: {
                    date: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
            },
            include: {
                session: {
                    select: {
                        date: true,
                    },
                },
            },
            orderBy: {
                session: {
                    date: 'asc',
                },
            },
        });

        return attendanceRecords.map(record => ({
            date: record.session.date.toISOString(),
            status: record.status,
            isLate: record.isLate,
            remarks: record.remarks,
        }));
    }
}
