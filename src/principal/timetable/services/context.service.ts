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
                subject: { select: { name: true, code: true } },
                teacher: { select: { user: { select: { name: true } } } },
                room: { select: { name: true } },
                timeSlot: true,
            },
        });
    }

    async getTimetableForRoom(schoolId: number, academicYearId: number, roomId: number) {
        // Ownership Check
        const room = await this.prisma.room.findFirst({ where: { id: roomId, schoolId } });
        if (!room) throw new NotFoundException('Room not found or unauthorized');

        return this.prisma.timetableEntry.findMany({
            where: { schoolId, academicYearId, roomId },
            include: {
                subject: { select: { name: true, code: true } },
                teacher: { select: { user: { select: { name: true } } } },
                group: { select: { name: true } },
                timeSlot: true,
            },
        });
    }

    async getTimetableForTeacher(schoolId: number, academicYearId: number, teacherId: number) {
        // Ownership Check
        const teacher = await this.prisma.teacherProfile.findFirst({ where: { id: teacherId, schoolId } });
        if (!teacher) throw new NotFoundException('Teacher not found or unauthorized');

        return this.prisma.timetableEntry.findMany({
            where: { schoolId, academicYearId, teacherId },
            include: {
                subject: { select: { name: true, code: true } },
                group: { select: { name: true } },
                room: { select: { name: true } },
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
        const [periods, subjects, teachers, rooms] = await Promise.all([
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
                select: { id: true, name: true }
            }),
        ]);

        return {
            periods,
            subjects,
            teachers,
            rooms,
            scheduleId,
        };
    }
}
