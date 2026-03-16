import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { HomeworkStatus } from '@prisma/client';

@Injectable()
export class StudentHomeworkService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll(schoolId: number, studentUserId: number, academicYearId: number | undefined, query: any) {
        const student = await this.prisma.studentProfile.findUnique({
            where: { userId: studentUserId },
            select: { id: true, sectionId: true, classId: true }
        });

        if (!student) throw new NotFoundException('Student profile not found');

        const where: any = {
            schoolId,
            academicYearId,
            OR: [
                { sectionId: student.sectionId },
                { groupId: { in: await this.getStudentGroupIds(student.id) } }
            ]
        };

        if (query.subjectId) where.subjectId = +query.subjectId;

        const homeworks = await this.prisma.homework.findMany({
            where,
            include: {
                subject: { select: { id: true, name: true, code: true } },
                submissions: {
                    where: { studentId: student.id },
                    select: { status: true, submittedAt: true }
                }
            },
            orderBy: { dueDate: 'desc' }
        });

        return homeworks.map(hw => {
            const submission = hw.submissions[0];
            return {
                ...hw,
                submissionStatus: submission?.status || 'PENDING',
                submittedAt: submission?.submittedAt
            };
        });
    }

    async findOne(schoolId: number, studentUserId: number, id: number) {
        const student = await this.prisma.studentProfile.findUnique({
            where: { userId: studentUserId },
            select: { id: true }
        });

        if (!student) throw new NotFoundException('Student profile not found');

        const homework = await this.prisma.homework.findFirst({
            where: { id, schoolId },
            include: {
                subject: { select: { id: true, name: true, code: true } },
                teacher: { select: { user: { select: { name: true } } } },
                submissions: {
                    where: { studentId: student.id }
                }
            }
        });

        if (!homework) throw new NotFoundException('Homework not found');

        return homework;
    }

    private async getStudentGroupIds(studentId: number): Promise<number[]> {
        const groups = await this.prisma.academicGroup.findMany({
            where: { students: { some: { id: studentId } } },
            select: { id: true }
        });
        return groups.map(g => g.id);
    }
}
