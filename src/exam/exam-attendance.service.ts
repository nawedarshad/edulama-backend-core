import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExamAttendanceService {
    constructor(private readonly prisma: PrismaService) { }

    async markAttendance(schoolId: number, academicYearId: number, examId: number, scheduleId: number, data: { studentId: number; isPresent: boolean, remarks?: string }[]) {
        // Determine the exam result status: if marking attendance, we might be initializing the Result record.
        // If the result already exists (e.g. marks entered), update attendance.
        // If not, create it with PENDING status.

        const results = [];

        // Using transaction to ensure all updates succeed
        await this.prisma.$transaction(async (prisma) => {
            for (const item of data) {
                // Check if result exists
                const existing = await prisma.examResult.findUnique({
                    where: {
                        scheduleId_studentId: {
                            scheduleId,
                            studentId: item.studentId,
                        }
                    }
                });

                if (existing) {
                    // Update
                    await prisma.examResult.update({
                        where: { id: existing.id },
                        data: {
                            isPresent: item.isPresent,
                            remarks: item.remarks, // Optional: might overwrite remarks
                            gradeStatus: !item.isPresent ? 'ABSENT' : existing.gradeStatus, // Set ABSENT if marked absent
                        }
                    });
                } else {
                    // Get schedule details for maxMarks (required for creation?)
                    // Wait, maxMarks is required in Schema.
                    const schedule = await prisma.examSchedule.findUnique({ where: { id: scheduleId } });
                    if (!schedule) throw new BadRequestException('Schedule not found');

                    // Create new result record
                    await prisma.examResult.create({
                        data: {
                            schoolId,
                            academicYearId,
                            examId,
                            scheduleId,
                            studentId: item.studentId,
                            maxMarks: schedule.maxMarks,
                            status: 'PENDING',
                            isPresent: item.isPresent,
                            remarks: item.remarks,
                            gradeStatus: !item.isPresent ? 'ABSENT' : undefined,
                        }
                    });
                }
            }
        });

        return { message: 'Attendance marked successfully' };
    }

    async getAttendance(schoolId: number, academicYearId: number, scheduleId: number) {
        // Return list of students for the schedule with their attendance status
        // We need all eligible students, even if they don't have a result record yet.

        const schedule = await this.prisma.examSchedule.findUnique({
            where: { id: scheduleId },
            include: {
                class: {
                    include: {
                        StudentProfile: {
                            where: { schoolId, academicYearId, isActive: true }, // Filter active students
                            include: { user: { select: { name: true } } }
                        }
                    }
                }
            }
        });

        if (!schedule) throw new BadRequestException('Schedule not found');

        // Filter students by section if schedule is section-specific
        let students = schedule.class.StudentProfile;
        if (schedule.sectionId) {
            students = students.filter(s => s.sectionId === schedule.sectionId);
        }

        // Get existing results (attendance)
        const results = await this.prisma.examResult.findMany({
            where: { scheduleId, schoolId },
        });

        return students.map(student => {
            const result = results.find(r => r.studentId === student.id);
            return {
                studentId: student.id,
                name: student.user.name,
                rollNumber: student.rollNo,
                isPresent: result ? result.isPresent : true, // Default to true if not marked yet? Or null? Let's say null/true.
                status: result ? (result.isPresent ? 'PRESENT' : 'ABSENT') : 'NOT_MARKED',
                remarks: result?.remarks,
            };
        });
    }
}
