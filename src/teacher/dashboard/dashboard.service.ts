import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DayOfWeek } from '@prisma/client';

@Injectable()
export class DashboardService {
    constructor(private readonly prisma: PrismaService) { }

    async getDashboardStats(schoolId: number, userId: number) {
        // 1. Get Teacher Profile ID
        const teacher = await this.prisma.teacherProfile.findUnique({
            where: { userId },
            select: { id: true, schoolId: true }
        });

        if (!teacher) return { subjects: 0, students: 0, todayLectures: 0 };

        // 2. Get Current Academic Year (Assuming active year)
        // ideally passed or fetched from school config, simpler here:
        const academicYear = await this.prisma.academicYear.findFirst({
            where: { schoolId, status: 'ACTIVE' }
        });

        if (!academicYear) return { subjects: 0, students: 0, todayLectures: 0 };

        const academicYearId = academicYear.id;

        // 3. Stats Calculation

        // A. My Subjects (Count of Unique Class-Subjects assigned)
        const subjectsCount = await this.prisma.classSubject.count({
            where: {
                schoolId,
                academicYearId,
                teacherProfileId: teacher.id
            }
        });

        // B. Total Students (Active students in sections I teach at least one subject to)
        // This avoids double counting if I teach Math and Science to 9A.
        const studentsCount = await this.prisma.studentProfile.count({
            where: {
                schoolId,
                academicYearId,
                isActive: true,
                section: {
                    OR: [
                        // Case 1: I am the Class Teacher (Section Teacher)
                        { classTeacher: { teacherId: teacher.id } },
                        // Case 2: I teach a subject in this section
                        { ClassSubject: { some: { teacherProfileId: teacher.id } } }
                    ]
                }
            }
        });

        // C. Today's Lectures
        const today = new Date();
        const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
        const currentDayEnum = days[today.getDay()] as DayOfWeek;

        const todayLectures = await this.prisma.timetableEntry.count({
            where: {
                schoolId,
                academicYearId,
                teacherId: teacher.id,
                day: currentDayEnum,
                period: {
                    // Filter for teaching periods if necessary, 
                    // generally all entries in timetable for a teacher are relevant
                    type: 'TEACHING'
                }
            }
        });

        // D. Next Class (Optional enhancement)
        const nextClass = await this.prisma.timetableEntry.findFirst({
            where: {
                schoolId,
                academicYearId,
                teacherId: teacher.id,
                day: currentDayEnum,
                period: {
                    endTime: {
                        gt: this.getCurrentTimeHash() // Helper to compare "HH:MM"
                    }
                }
            },
            orderBy: { period: { startTime: 'asc' } },
            include: {
                class: { select: { name: true } },
                section: { select: { name: true } },
                subject: { select: { name: true, code: true } },
                period: { select: { startTime: true, endTime: true } }
            }
        });

        return {
            subjects: subjectsCount,
            students: studentsCount,
            todayLectures,
            nextClass: nextClass ? {
                className: `${nextClass.class.name}-${nextClass.section.name}`,
                subject: nextClass.subject.name,
                time: `${nextClass.period.startTime} - ${nextClass.period.endTime}`
            } : null
        };
    }

    private getCurrentTimeHash(): string {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    }
}
