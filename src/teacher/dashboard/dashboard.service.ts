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

        if (!teacher) return { subjects: 0, students: 0, todayLectures: 0, timeline: [], substitutions: [] };

        // 2. Get Current Academic Year (Assuming active year)
        const academicYear = await this.prisma.academicYear.findFirst({
            where: { schoolId, status: 'ACTIVE' }
        });

        if (!academicYear) return { subjects: 0, students: 0, todayLectures: 0, timeline: [], substitutions: [] };

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
        const studentsCount = await this.prisma.studentProfile.count({
            where: {
                schoolId,
                academicYearId,
                isActive: true,
                section: {
                    OR: [
                        { classTeacher: { teacherId: teacher.id } },
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
                period: { type: 'TEACHING' }
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

        // E. Timeline (Full Schedule for Today)
        const timelineEntries = await this.prisma.timetableEntry.findMany({
            where: {
                schoolId,
                academicYearId,
                teacherId: teacher.id,
                day: currentDayEnum
            },
            orderBy: { period: { startTime: 'asc' } },
            include: {
                class: { select: { name: true } },
                section: { select: { name: true } },
                subject: { select: { name: true, code: true } },
                period: { select: { id: true, name: true, startTime: true, endTime: true, type: true } },
                room: { select: { name: true } }
            }
        });

        // F. Substitutions (Where I am the substitute teacher today)
        const startOfDay = new Date(today.setHours(0, 0, 0, 0));
        const endOfDay = new Date(today.setHours(23, 59, 59, 999));

        const substitutions = await this.prisma.timetableOverride.findMany({
            where: {
                schoolId,
                academicYearId,
                substituteTeacherId: teacher.id,
                date: {
                    gte: startOfDay,
                    lte: endOfDay
                }
            },
            include: {
                entry: {
                    include: {
                        class: { select: { name: true } },
                        section: { select: { name: true } },
                        subject: { select: { name: true } },
                        period: { select: { name: true, startTime: true, endTime: true } }
                    }
                }
            }
        });

        // G. Get My Assignments for linking (Optimization: Fetch once)
        const myAssignments = await this.prisma.classSubject.findMany({
            where: {
                schoolId,
                academicYearId,
                teacherProfileId: teacher.id
            },
            select: { id: true, classId: true, sectionId: true, subjectId: true }
        });

        const assignmentMap = new Map<string, number>();
        myAssignments.forEach(a => {
            assignmentMap.set(`${a.classId}-${a.sectionId}-${a.subjectId}`, a.id);
        });

        // Helper to find assignment ID
        const getAssignmentId = (cId: number, sId: number, subId: number) =>
            assignmentMap.get(`${cId}-${sId}-${subId}`) || null;

        // H. Critical Alert: Unmarked Attendance
        let unmarkedAttendanceCount = 0;
        const currentHash = this.getCurrentTimeHash();

        for (const entry of timelineEntries) {
            if (entry.period.startTime <= currentHash && entry.period.type === 'TEACHING') {
                const sessionExists = await this.prisma.attendanceSession.count({
                    where: {
                        schoolId,
                        academicYearId,
                        classId: entry.classId,
                        sectionId: entry.sectionId,
                        subjectId: entry.subjectId,
                        date: { gte: startOfDay, lte: endOfDay }
                    }
                });
                if (sessionExists === 0) unmarkedAttendanceCount++;
            }
        }

        // I. Pending Actions: Leave Requests
        const mySections = await this.prisma.section.findMany({
            where: { classTeacher: { teacherId: teacher.id } },
            select: { id: true }
        });

        let pendingLeaveRequests = 0;
        if (mySections.length > 0) {
            const mySectionIds = mySections.map(s => s.id);
            pendingLeaveRequests = await this.prisma.leaveRequest.count({
                where: {
                    schoolId,
                    academicYearId,
                    status: 'PENDING',
                    applicant: { studentProfile: { sectionId: { in: mySectionIds } } }
                }
            });
        }

        // J. Critical Alert: Recent Discipline Reports (Last 48 hours)
        let recentDisciplineCount = 0;
        if (mySections.length > 0) {
            const mySectionIds = mySections.map(s => s.id);
            const fortyEightHoursAgo = new Date();
            fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);

            recentDisciplineCount = await this.prisma.incidentReport.count({
                where: {
                    schoolId,
                    academicYearId,
                    createdAt: { gte: fortyEightHoursAgo },
                    student: { sectionId: { in: mySectionIds } }
                }
            });
        }

        // K. Syllabus Progress Tracker
        const syllabusProgress: { subject: string; percentage: number; total: number; completed: number }[] = [];
        // Unique Class-Subjects to avoid double counting if schema is shared
        const uniqueSubjects = new Map<string, { classId: number; subjectId: number; name: string }>();

        // Need names for display, fetch details
        const assignmentsWithDetails = await this.prisma.classSubject.findMany({
            where: { id: { in: Array.from(assignmentMap.values()) } },
            include: { subject: true, class: true, section: true }
        });

        for (const assign of assignmentsWithDetails) {
            const key = `${assign.classId}-${assign.subjectId}`;
            if (!uniqueSubjects.has(key)) {
                uniqueSubjects.set(key, {
                    classId: assign.classId,
                    subjectId: assign.subjectId,
                    name: `${assign.subject.name} (${assign.class.name})`
                });
            }
        }

        for (const item of uniqueSubjects.values()) {
            // 1. Calculations
            const total = await this.prisma.syllabus.count({
                where: {
                    schoolId,
                    academicYearId,
                    classId: item.classId,
                    subjectId: item.subjectId,
                    type: 'TOPIC'
                }
            });

            if (total > 0) {
                const completed = await this.prisma.syllabus.count({
                    where: {
                        schoolId,
                        academicYearId,
                        classId: item.classId,
                        subjectId: item.subjectId,
                        type: 'TOPIC',
                        status: 'COMPLETED'
                    }
                });

                // 2. Get Next Topic (What to teach today/next)
                const nextTopic = await this.prisma.syllabus.findFirst({
                    where: {
                        schoolId,
                        academicYearId,
                        classId: item.classId,
                        subjectId: item.subjectId,
                        type: 'TOPIC',
                        status: { not: 'COMPLETED' } // Pending or In Progress
                    },
                    orderBy: { orderIndex: 'asc' },
                    include: { parent: true } // Get Unit/Chapter info
                });

                const percentage = Math.round((completed / total) * 100);

                syllabusProgress.push({
                    subject: item.name,
                    percentage,
                    total,
                    completed,
                    nextTopic: nextTopic ? {
                        title: nextTopic.title,
                        parent: nextTopic.parent ? nextTopic.parent.title : null
                    } : null
                });
            }
        }

        return {
            subjects: subjectsCount,
            students: studentsCount,
            todayLectures,
            nextClass: nextClass ? {
                className: `${nextClass.class.name}-${nextClass.section.name}`,
                subject: nextClass.subject.name,
                time: `${nextClass.period.startTime} - ${nextClass.period.endTime}`
            } : null,
            timeline: timelineEntries.map(entry => ({
                id: entry.id,
                periodName: entry.period.name,
                startTime: entry.period.startTime,
                endTime: entry.period.endTime,
                className: entry.class?.name ? `${entry.class.name}-${entry.section.name}` : 'N/A',
                subject: entry.subject?.name || 'Free / Activity',
                room: entry.room?.name || 'N/A',
                type: entry.period.type,
                assignmentId: entry.classId && entry.sectionId && entry.subjectId
                    ? getAssignmentId(entry.classId, entry.sectionId, entry.subjectId)
                    : null
            })),
            substitutions: substitutions.map(sub => ({
                id: sub.id,
                className: `${sub.entry.class.name}-${sub.entry.section.name}`,
                subject: sub.entry.subject.name,
                period: sub.entry.period.name,
                time: `${sub.entry.period.startTime} - ${sub.entry.period.endTime}`,
                note: sub.note,
                assignmentId: null
            })),
            alerts: {
                unmarkedAttendance: unmarkedAttendanceCount,
                pendingLeaves: pendingLeaveRequests,
                discipline: recentDisciplineCount
            },
            syllabus: syllabusProgress.sort((a, b) => a.percentage - b.percentage)
        };


    }

    private getCurrentTimeHash(): string {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    }
}
