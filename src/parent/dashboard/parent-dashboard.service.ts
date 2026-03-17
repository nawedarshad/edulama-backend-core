import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DayOfWeek } from '@prisma/client';

@Injectable()
export class ParentDashboardService {
    constructor(private readonly prisma: PrismaService) { }

    private async validateParentChildLink(schoolId: number, parentUserId: number, studentId: number) {
        const link = await this.prisma.parentStudent.findFirst({
            where: {
                parent: { userId: parentUserId },
                student: { id: studentId, schoolId }
            }
        });

        if (!link) {
            throw new ForbiddenException('You can only access data for your own children.');
        }
    }

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

    private getCurrentTimeHash(): string {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    async getDashboardStats(schoolId: number, parentUserId: number, studentId: number) {
        await this.validateParentChildLink(schoolId, parentUserId, studentId);

        const student = await this.prisma.studentProfile.findUnique({
            where: { id: studentId },
            include: {
                academicGroups: { select: { id: true } }
            }
        });

        if (!student) throw new NotFoundException('Student not found');

        const groupIds = student.academicGroups.map(g => g.id);
        const academicYearId = student.academicYearId;

        // 1. Subjects Count
        const subjectsCount = await this.prisma.subjectAssignment.count({
            where: {
                schoolId,
                academicYearId,
                isActive: true,
                OR: [
                    { groupId: { in: groupIds } },
                    { classId: student.classId, sectionId: student.sectionId }
                ]
            }
        });

        // 2. Today's Lectures
        const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
        const currentDayEnum = days[new Date().getDay()] as DayOfWeek;

        const timelineEntries = await this.prisma.timetableEntry.findMany({
            where: {
                schoolId,
                academicYearId,
                day: currentDayEnum,
                status: { in: ['PUBLISHED', 'LOCKED'] },
                groupId: { in: groupIds }
            },
            orderBy: { timeSlot: { startTime: 'asc' } },
            include: {
                group: { select: { name: true } },
                subject: { select: { name: true, code: true } },
                timeSlot: {
                    include: { period: { select: { name: true, startTime: true, endTime: true, type: true } } }
                },
                room: { select: { name: true } },
                teacher: { select: { user: { select: { name: true } } } }
            }
        });

        // 3. Get Assignment IDs for the student
        const assignments = await this.prisma.subjectAssignment.findMany({
            where: {
                schoolId,
                academicYearId,
                isActive: true,
                OR: [
                    { groupId: { in: groupIds } },
                    { classId: student.classId, sectionId: student.sectionId }
                ]
            },
            select: { id: true, groupId: true, subjectId: true }
        });

        const assignmentMap = new Map<string, number>();
        assignments.forEach(a => {
            if (a.groupId) assignmentMap.set(`${a.groupId}-${a.subjectId}`, a.id);
        });

        const getAssignmentId = (gId: number, subId: number) => 
            assignmentMap.get(`${gId}-${subId}`) || null;

        return {
            subjects: subjectsCount,
            students: 0, // Not relevant for parents
            todayLectures: timelineEntries.length,
            nextClass: null, // Optional enhancement
            timeline: timelineEntries.map(entry => {
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
                };
            }),
            substitutions: [], // Could be added if needed
            alerts: {
                unmarkedAttendance: 0, // Not relevant for parents
                pendingLeaves: 0,
                discipline: 0
            }
        };
    }
}
