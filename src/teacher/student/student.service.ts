import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TeacherStudentService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll(schoolId: number, academicYearId: number) {
        return this.prisma.studentProfile.findMany({
            where: {
                schoolId,
                academicYearId,
                isActive: true // Only active students
            },
            select: {
                userId: true, // Correct ID for raising grievance against User
                fullName: true,
                rollNo: true,
                class: {
                    select: { name: true }
                },
                section: {
                    select: { name: true }
                }
            },
            orderBy: [
                { class: { name: 'asc' } },
                { section: { name: 'asc' } },
                { rollNo: 'asc' }
            ]
        });
    }
}
