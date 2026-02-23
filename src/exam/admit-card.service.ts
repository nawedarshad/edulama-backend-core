import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdmitCardService {
    constructor(private readonly prisma: PrismaService) { }

    async generateAdmitCard(schoolId: number, academicYearId: number, studentId: number, examId: number) {
        // 1. Get Exam Details
        const exam = await this.prisma.exam.findFirst({
            where: { id: examId, schoolId, academicYearId },
            include: {
                school: {
                    select: {
                        name: true,
                        schoolSettings: { select: { street: true, city: true, logoUrl: true, phone: true, email: true } }
                    }
                },
                academicYear: { select: { name: true } },
            },
        });

        if (!exam) {
            throw new NotFoundException('Exam not found');
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

        // 3. Get Schedules & Seating
        // We need to fetch all schedules for this exam and checks if the student has a seat/is eligible
        const schedules = await this.prisma.examSchedule.findMany({
            where: {
                examId,
                schoolId,
                classId: student.classId,
                examDate: { not: null }, // Only include scheduled subjects
                // If sectionId is specific, match it. If null, valid for all.
                OR: [
                    { sectionId: student.sectionId },
                    { sectionId: null },
                ],
            },
            include: {
                subject: { select: { name: true, code: true } },
                room: { select: { name: true, code: true } }, // Default room
            },
            orderBy: { examDate: 'asc' },
        });

        // Fetch specific seating for this student
        const seatingArrangements = await this.prisma.seatingArrangement.findMany({
            where: {
                examId,
                schoolId,
                studentId,
            },
            include: {
                room: { select: { name: true, code: true } },
            },
        });

        // Merge schedule with seating info
        const examSchedule = schedules.map(schedule => {
            const seating = seatingArrangements.find(s => s.scheduleId === schedule.id);
            return {
                date: schedule.examDate,
                startTime: schedule.startTime,
                endTime: schedule.endTime,
                subject: schedule.subject.name,
                subjectCode: schedule.subject.code,
                room: seating?.room?.name || schedule.room?.name || 'TBA',
                seatNumber: seating?.seatNumber || 'TBA',
            };
        });

        return {
            schoolName: exam.school.name,
            schoolAddress: `${exam.school.schoolSettings?.street || ''}, ${exam.school.schoolSettings?.city || ''}`,
            logoUrl: exam.school.schoolSettings?.logoUrl,
            examName: exam.name,
            academicYear: exam.academicYear.name,
            studentName: student.user.name,
            rollNumber: student.rollNo,
            class: student.class.name,
            section: student.section?.name || '',
            admitCardId: `ADMIT-${exam.code}-${student.rollNo || student.admissionNo}`,
            generatedAt: new Date(),
            schedule: examSchedule,
            instructions: [
                'Please bring this admit card to the examination hall.',
                'Do not carry any prohibited items like mobile phones or smartwatches.',
                'Reach the examination center 15 minutes before the scheduled time.',
            ],
        };
    }
}
