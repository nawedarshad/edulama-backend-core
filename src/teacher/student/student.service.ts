import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TeacherStudentService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll(schoolId: number, academicYearId: number, classId?: number, sectionId?: number) {
        const where: any = {
            schoolId,
            academicYearId,
            isActive: true
        };

        if (classId) where.classId = classId;
        if (sectionId) where.sectionId = sectionId;

        const students = await this.prisma.studentProfile.findMany({
            where,
            select: {
                userId: true, // Correct ID for raising grievance against User
                fullName: true,
                rollNo: true,
                personalInfo: {
                    select: { gender: true }
                },
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

        return students.map(student => ({
            ...student,
            gender: student.personalInfo?.gender,
            personalInfo: undefined // clean up
        }));
    }
}
