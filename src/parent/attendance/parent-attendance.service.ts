import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ParentAttendanceService {
    constructor(private readonly prisma: PrismaService) { }

    async getStudentAttendance(studentId: number, schoolId: number, month: number, year: number) {
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59, 999);

        const attendanceRecords = await this.prisma.attendance.findMany({
            where: {
                studentProfileId: studentId,
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
