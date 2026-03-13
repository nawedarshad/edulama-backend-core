import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DayOfWeek } from '@prisma/client';

@Injectable()
export class DashboardService {
    constructor(private readonly prisma: PrismaService) { }

    /** Normalise a time string to "HH:MM" regardless of whether it's an ISO
     *  timestamp ("2026-03-08T03:30:00.000Z") or already "HH:MM". */
    private normaliseTime(t: string | null | undefined): string {
        if (!t) return '00:00';
        if (t.includes('T')) {
            const d = new Date(t);
            if (!isNaN(d.valueOf())) {
                return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
            }
        }
        return t;
    }

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
                status: { in: ['PUBLISHED', 'LOCKED'] },
                timeSlot: { period: { type: 'TEACHING' } }
            }
        });

        // D. Next Class (Optional enhancement)
        const nextClass = await this.prisma.timetableEntry.findFirst({
            where: {
                schoolId,
                academicYearId,
                teacherId: teacher.id,
                day: currentDayEnum,
                status: { in: ['PUBLISHED', 'LOCKED'] },
                timeSlot: {
                    endTime: {
                        gt: this.getCurrentTimeHash() // Helper to compare "HH:MM"
                    }
                }
            },
            orderBy: { timeSlot: { startTime: 'asc' } },
            include: {
                group: { select: { name: true } },
                subject: { select: { name: true, code: true } },
                timeSlot: { select: { startTime: true, endTime: true, period: { select: { name: true, startTime: true, endTime: true } } } }
            }
        });

        // E. Timeline (Full Schedule for Today)
        const timelineEntries = await this.prisma.timetableEntry.findMany({
            where: {
                schoolId,
                academicYearId,
                teacherId: teacher.id,
                day: currentDayEnum,
                status: { in: ['PUBLISHED', 'LOCKED'] }
            },
            orderBy: { timeSlot: { startTime: 'asc' } },
            include: {
                group: { select: { id: true, name: true, classId: true } },
                subject: { select: { name: true, code: true } },
                timeSlot: {
                    select: {
                        id: true,
                        startTime: true,
                        endTime: true,
                        period: { select: { id: true, name: true, type: true, startTime: true, endTime: true } }
                    }
                },
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
                        group: { select: { name: true } },
                        subject: { select: { name: true } },
                        timeSlot: { include: { period: { select: { name: true, startTime: true, endTime: true } } } }
                    }
                }
            }
        });

        // G. Get My Assignments for linking (Optimization: Fetch once)
        const myAssignments = await this.prisma.subjectAssignment.findMany({
            where: {
                schoolId,
                academicYearId,
                teacherId: teacher.id
            },
            select: { id: true, groupId: true, subjectId: true }
        });

        const assignmentMap = new Map<string, number>();
        myAssignments.forEach(a => {
            assignmentMap.set(`${a.groupId}-${a.subjectId}`, a.id);
        });

        // Helper to find assignment ID
        const getAssignmentId = (gId: number, subId: number) =>
            assignmentMap.get(`${gId}-${subId}`) || null;

        // H. Critical Alert: Unmarked Attendance
        let unmarkedAttendanceCount = 0;
        const currentHash = this.getCurrentTimeHash();

        for (const entry of timelineEntries) {
            const entryStart = this.normaliseTime(entry.timeSlot.period?.startTime ?? entry.timeSlot.startTime);
            if (entryStart <= currentHash && entry.timeSlot.period?.type === 'TEACHING') {
                const sessionExists = await this.prisma.attendanceSession.count({
                    where: {
                        schoolId,
                        academicYearId,
                        groupId: entry.groupId,
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

        const mySectionIds = mySections.map(s => s.id);

        let pendingLeaveRequests = 0;
        if (mySections.length > 0) {
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
        interface SyllabusItem {
            key?: string;
            subject: string;
            percentage: number;
            total: number;
            completed: number;
            nextTopic: { title: string; parent: string | null } | null;
        }
        const syllabusProgress: SyllabusItem[] = [];
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
                    key: `${item.classId}-${item.subjectId}`, // Add key for sorting
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

        // Calculate sort order based on timeline
        const todayOrder = new Map<string, number>();
        timelineEntries.forEach((entry, index) => {
            if (entry.groupId && entry.subjectId) {
                const key = `${entry.groupId}-${entry.subjectId}`;
                if (!todayOrder.has(key)) {
                    todayOrder.set(key, index);
                }
            }
        });

        const sortedSyllabus = syllabusProgress.sort((a, b) => {
            const indexA = a.key ? todayOrder.get(a.key) : undefined;
            const indexB = b.key ? todayOrder.get(b.key) : undefined;

            // 1. Both in today's schedule: Sort by earliest period
            if (indexA !== undefined && indexB !== undefined) return indexA - indexB;

            // 2. Only A is today: A comes first
            if (indexA !== undefined) return -1;

            // 3. Only B is today: B comes first
            if (indexB !== undefined) return 1;

            // 4. Neither today: Sort by percentage (Lowest completed first - "Needs Attention")
            return a.percentage - b.percentage;
        }).map(({ key, ...rest }) => rest); // Remove key from final output

        return {
            subjects: subjectsCount,
            students: studentsCount,
            todayLectures,
            nextClass: nextClass ? {
                className: nextClass.group.name,
                subject: nextClass.subject?.name || 'N/A',
                time: `${this.normaliseTime(nextClass.timeSlot?.period?.startTime ?? nextClass.timeSlot.startTime)} - ${this.normaliseTime(nextClass.timeSlot?.period?.endTime ?? nextClass.timeSlot.endTime)}`
            } : null,
            timeline: timelineEntries.map(entry => {
                // Prefer TimePeriod startTime/endTime (always "HH:MM"), fallback to TimeSlot's
                const start = this.normaliseTime(entry.timeSlot.period?.startTime ?? entry.timeSlot.startTime);
                const end = this.normaliseTime(entry.timeSlot.period?.endTime ?? entry.timeSlot.endTime);
                return {
                    id: entry.id,
                    periodName: entry.timeSlot.period?.name || 'Unnamed',
                    startTime: start,
                    endTime: end,
                    className: entry.group.name,
                    subject: entry.subject?.name || 'Free / Activity',
                    room: entry.room?.name || 'N/A',
                    type: entry.timeSlot.period?.type,
                    assignmentId: entry.groupId && entry.subjectId
                        ? getAssignmentId(entry.groupId, entry.subjectId)
                        : null,
                    classId: entry.group.classId,
                    sectionId: entry.groupId,
                    subjectId: entry.subjectId
                };
            }),
            substitutions: substitutions.map(sub => {
                const start = this.normaliseTime(sub.entry.timeSlot.period?.startTime ?? sub.entry.timeSlot.startTime);
                const end = this.normaliseTime(sub.entry.timeSlot.period?.endTime ?? sub.entry.timeSlot.endTime);
                return {
                    id: sub.id,
                    className: sub.entry.group.name,
                    subject: sub.entry.subject?.name || 'N/A',
                    period: sub.entry.timeSlot.period?.name || 'Unnamed',
                    time: `${start} - ${end}`,
                    note: sub.note,
                    assignmentId: null
                };
            }),
            alerts: {
                unmarkedAttendance: unmarkedAttendanceCount,
                pendingLeaves: pendingLeaveRequests,
                discipline: recentDisciplineCount
            },
            syllabus: sortedSyllabus,
            birthdays: await this.getBirthdays(schoolId, academicYearId, mySectionIds),
            atRisk: await this.getAtRiskStudents(schoolId, academicYearId, mySectionIds)
        };
    }

    // New Helper: Get Birthdays
    private async getBirthdays(schoolId: number, academicYearId: number, sectionIds: number[]) {
        if (sectionIds.length === 0) return [];

        const today = new Date();
        const currentMonth = today.getMonth() + 1; // JS months are 0-indexed
        const currentDate = today.getDate();

        // Prisma doesn't support date extraction natively cleanly w/o Raw, 
        // but fetching basic profile for section students is efficient enough.
        const students = await this.prisma.studentProfile.findMany({
            where: {
                schoolId,
                academicYearId,
                sectionId: { in: sectionIds },
                isActive: true
            },
            select: {
                id: true,
                fullName: true,
                dob: true,
                photo: true,
                class: { select: { name: true } },
                section: { select: { name: true } }
            }
        });

        return students.filter(s => {
            if (!s.dob) return false;
            const d = new Date(s.dob);
            return d.getMonth() + 1 === currentMonth && d.getDate() === currentDate;
        }).map(s => ({
            id: s.id,
            name: s.fullName,
            class: `${s.class.name}-${s.section.name}`,
            photo: s.photo
        }));
    }

    // New Helper: Get At-Risk Students (< 75% Attendance)
    private async getAtRiskStudents(schoolId: number, academicYearId: number, sectionIds: number[]) {
        if (sectionIds.length === 0) return [];

        // Aggregation for Daily Attendance
        const summaries = await this.prisma.attendanceSummary.groupBy({
            by: ['studentId'],
            where: {
                schoolId,
                academicYearId,
                subjectId: null, // Daily Attendance
                groupId: { in: sectionIds }
            },
            _sum: {
                present: true,
                totalDays: true
            }
        });

        const atRiskIds = summaries
            .filter(s => {
                const total = s._sum?.totalDays || 0;
                const present = s._sum?.present || 0;
                return total > 0 && (present / total) < 0.75;
            })
            .map(s => s.studentId);

        if (atRiskIds.length === 0) return [];

        return this.prisma.studentProfile.findMany({
            where: { id: { in: atRiskIds } },
            select: {
                id: true,
                fullName: true,
                photo: true,
                rollNo: true,
                class: { select: { name: true } },
                section: { select: { name: true } }
            },
            take: 5 // Limit to top 5 critical cases
        });
    }

    private getCurrentTimeHash(): string {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    }
}
