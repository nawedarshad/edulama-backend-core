import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class TimetableContextService {
    constructor(private readonly prisma: PrismaService) { }

    async getTimetableForGroup(schoolId: number, academicYearId: number, groupId: number) {
        // Ownership Check
        const group = await this.prisma.academicGroup.findFirst({ where: { id: groupId, schoolId } });
        if (!group) throw new NotFoundException('Group not found or unauthorized');

        return this.prisma.timetableEntry.findMany({
            where: { schoolId, academicYearId, groupId },
            include: {
                subject: { select: { name: true, code: true, color: true } },
                teacher: { select: { id: true, empCode: true, personalInfo: { select: { fullName: true } }, user: { select: { name: true } } } },
                teachers: { include: { teacher: { select: { id: true, empCode: true, personalInfo: { select: { fullName: true } }, user: { select: { name: true } } } } } },
                room: { select: { id: true, name: true, code: true } },
                rooms: { include: { room: { select: { id: true, name: true, code: true } } } },
                timeSlot: true,
            },
        });
    }

    async getTimetableForRoom(schoolId: number, academicYearId: number, roomId: number) {
        // Ownership Check
        const room = await this.prisma.room.findFirst({ where: { id: roomId, schoolId } });
        if (!room) throw new NotFoundException('Room not found or unauthorized');

        return this.prisma.timetableEntry.findMany({
            where: { 
                schoolId, 
                academicYearId, 
                OR: [
                    { roomId },
                    { rooms: { some: { roomId } } }
                ]
            },
            include: {
                subject: { select: { name: true, code: true, color: true } },
                group: { select: { name: true } },
                teacher: { select: { id: true, empCode: true, personalInfo: { select: { fullName: true } }, user: { select: { name: true } } } },
                teachers: { include: { teacher: { select: { id: true, empCode: true, personalInfo: { select: { fullName: true } }, user: { select: { name: true } } } } } },
                timeSlot: true,
            },
        });
    }

    async getTimetableForTeacher(schoolId: number, academicYearId: number, teacherId: number) {
        // Ownership Check
        const teacher = await this.prisma.teacherProfile.findFirst({ where: { id: teacherId, schoolId } });
        if (!teacher) throw new NotFoundException('Teacher not found or unauthorized');

        return this.prisma.timetableEntry.findMany({
            where: {
                schoolId,
                academicYearId,
                OR: [
                    { teacherId },
                    { teachers: { some: { teacherId } } }
                ]
            },
            include: {
                subject: { select: { name: true, code: true, color: true } },
                group: { select: { name: true } },
                room: { select: { id: true, name: true, code: true } },
                rooms: { include: { room: { select: { id: true, name: true, code: true } } } },
                timeSlot: true,
            },
        });
    }

    async getTimetableContext(
        schoolId: number,
        academicYearId: number,
        groupId: number,
        modules: string[] = [],
    ) {
        // 1. Group Ownership
        const group = await this.prisma.academicGroup.findFirst({
            where: { id: groupId, schoolId },
            include: { class: { select: { scheduleId: true } } }
        });
        if (!group) throw new NotFoundException('Group not found or unauthorized');

        const scheduleId = group.scheduleId || group.class?.scheduleId;

        // 2. Fetch context data (Optimized with specific selections)
        const [periods, subjects, teachers, rooms, entries, assignments] = await Promise.all([
            this.prisma.timePeriod.findMany({
                where: { schoolId, academicYearId, scheduleId },
                include: { timeSlots: true },
                orderBy: { startTime: 'asc' },
            }),
            this.prisma.subject.findMany({
                where: { schoolId },
                select: { id: true, name: true, code: true }
            }),
            this.prisma.teacherProfile.findMany({
                where: { schoolId, isActive: true },
                select: { id: true, user: { select: { name: true } } }
            }),
            this.prisma.room.findMany({
                where: { schoolId, status: 'ACTIVE' },
                select: { id: true, name: true, code: true }
            }),
            this.prisma.timetableEntry.findMany({
                where: { schoolId, academicYearId, groupId },
                include: {
                    subject: { select: { name: true, code: true, color: true } },
                    teacher: { select: { id: true, empCode: true, personalInfo: { select: { fullName: true } }, user: { select: { name: true } } } },
                    teachers: { include: { teacher: { select: { id: true, empCode: true, personalInfo: { select: { fullName: true } }, user: { select: { name: true } } } } } },
                    room: { select: { id: true, name: true, code: true } },
                    rooms: { include: { room: { select: { id: true, name: true, code: true } } } },
                    timeSlot: true,
                },
            }),
            this.prisma.subjectAssignment.findMany({
                where: {
                    schoolId,
                    academicYearId,
                    isActive: true,
                    OR: [
                        { groupId }, // Direct group assignment
                        { classId: group.classId, sectionId: group.sectionId } // Class/Section assignment
                    ]
                },
                include: {
                    subject: { select: { id: true, name: true, code: true, color: true } },
                    teacher: { select: { id: true, empCode: true, personalInfo: { select: { fullName: true } }, user: { select: { name: true } } } },
                }
            })
        ]);

        const allocations = assignments.map((a: any) => ({
            subjectId: a.subject.id,
            subjectName: a.subject.name,
            subjectCode: a.subject.code,
            teacherId: a.teacher?.id,
            teacherName: a.teacher?.user?.name,
            color: a.subject.color,
        }));

        return {
            periods,
            subjects,
            teachers,
            rooms,
            scheduleId,
            entries,
            allocations,
        };
    }
}
