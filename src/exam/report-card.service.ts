import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportCardService {
    constructor(private readonly prisma: PrismaService) { }

    async generateReportCard(schoolId: number, academicYearId: number, studentId: number, examId: number) {
        // 1. Get Exam Details
        const exam = await this.prisma.exam.findFirst({
            where: { id: examId, schoolId, academicYearId },
            include: {
                school: {
                    select: {
                        name: true,
                        schoolSettings: { select: { street: true, city: true, logoUrl: true } }
                    }
                },
                academicYear: { select: { name: true } },
            },
        });

        if (!exam) {
            throw new NotFoundException('Exam not found');
        }

        if (!exam.isResultPublic) {
            // Check if user is teacher/admin? For student service, this check is important.
            // For now, we assume this service might be called by internal controllers which handle permissions.
            // But usually report card is generated only when public or for teachers.
        }

        // 2. Get Student Details
        const student = await this.prisma.studentProfile.findFirst({
            where: { id: studentId, schoolId, academicYearId },
            include: {
                user: { select: { name: true } },
                class: { select: { name: true } },
                section: { select: { name: true } },
            },
        });

        if (!student) {
            throw new NotFoundException('Student not found');
        }

        // 3. Get Results
        const results = await this.prisma.examResult.findMany({
            where: {
                examId,
                schoolId,
                studentId,
                status: 'PUBLISHED', // Only published results
            },
            include: {
                schedule: {
                    include: {
                        subject: { select: { name: true, code: true } },
                    },
                },
            },
        });

        if (results.length === 0) {
            throw new NotFoundException('No results found for this exam');
        }

        // Calculate Totals
        let totalMaxMarks = 0;
        let totalObtainedMarks = 0;
        let resultStatus = 'PASS';

        const subjectWise = results.map(r => {
            totalMaxMarks += r.maxMarks;
            totalObtainedMarks += r.marksObtained || 0;
            if (r.gradeStatus === 'FAIL' || r.gradeStatus === 'ABSENT') {
                resultStatus = 'FAIL';
            }
            return {
                subject: r.schedule.subject.name,
                code: r.schedule.subject.code,
                maxMarks: r.maxMarks,
                obtainedMarks: r.marksObtained,
                grade: r.grade,
                remarks: r.remarks,
                status: r.gradeStatus,
            };
        });

        const percentage = totalMaxMarks > 0 ? (totalObtainedMarks / totalMaxMarks) * 100 : 0;

        return {
            schoolName: exam.school.name,
            examName: exam.name,
            studentName: student.user.name,
            rollNumber: student.rollNo,
            class: student.class.name,
            section: student.section?.name,
            results: subjectWise,
            summary: {
                totalMaxMarks,
                totalObtainedMarks,
                percentage: parseFloat(percentage.toFixed(2)),
                finalResult: resultStatus,
            },
            generatedAt: new Date(),
        };
    }
}
