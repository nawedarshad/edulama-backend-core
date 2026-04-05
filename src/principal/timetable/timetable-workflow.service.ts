import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditLogEvent } from '../../common/audit/audit.event';
import { TimetableInventoryService } from './services/inventory.service';

@Injectable()
export class TimetableWorkflowService {
    private readonly logger = new Logger(TimetableWorkflowService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly eventEmitter: EventEmitter2,
        private readonly inventory: TimetableInventoryService,
    ) { }

    async swapEntries(schoolId: number, academicYearId: number, dto: { entryId1: number; entryId2: number }, userId?: number) {
        const [entry1, entry2] = await Promise.all([
            this.prisma.timetableEntry.findFirst({
                where: { id: dto.entryId1, schoolId, academicYearId },
                include: { teachers: true, rooms: true, group: true }
            }),
            this.prisma.timetableEntry.findFirst({
                where: { id: dto.entryId2, schoolId, academicYearId },
                include: { teachers: true, rooms: true, group: true }
            }),
        ]);

        if (!entry1 || !entry2) throw new NotFoundException('One or both entries not found');
        if (entry1.isLocked || entry2.isLocked || entry1.status === 'LOCKED' || entry2.status === 'LOCKED') {
            throw new BadRequestException('Cannot swap locked entries.');
        }

        // Deep Conflict Validation (Cross-Check)
        // Entry 1 moving to Slot 2
        const avail1 = await this.inventory.checkAvailability(schoolId, academicYearId, {
            day: entry2.day,
            timeSlotId: entry2.timeSlotId,
            groupId: entry1.groupId,
            teacherIds: entry1.teachers.map(t => t.teacherId),
            roomIds: entry1.rooms.map(r => r.roomId),
            durationSlots: entry1.durationSlots,
            subjectId: entry1.subjectId ?? undefined
        });
        if (avail1.status === 'CONFLICT') throw new ConflictException(`Cannot move ${entry1.group?.name} to new slot: ${avail1.message}`);

        // Entry 2 moving to Slot 1
        const avail2 = await this.inventory.checkAvailability(schoolId, academicYearId, {
            day: entry1.day,
            timeSlotId: entry1.timeSlotId,
            groupId: entry2.groupId,
            teacherIds: entry2.teachers.map(t => t.teacherId),
            roomIds: entry2.rooms.map(r => r.roomId),
            durationSlots: entry2.durationSlots,
            subjectId: entry2.subjectId ?? undefined
        });
        if (avail2.status === 'CONFLICT') throw new ConflictException(`Cannot move ${entry2.group?.name} to new slot: ${avail2.message}`);

        await this.prisma.$transaction(async (tx) => {
            // Swap core metadata
            await tx.timetableEntry.update({
                where: { id_schoolId: { id: entry1.id, schoolId } },
                data: { day: entry2.day, timeSlotId: entry2.timeSlotId, roomId: entry2.roomId },
            });
            await tx.timetableEntry.update({
                where: { id_schoolId: { id: entry2.id, schoolId } },
                data: { day: entry1.day, timeSlotId: entry1.timeSlotId, roomId: entry1.roomId },
            });
        });

        this.eventEmitter.emit('audit.log', new AuditLogEvent(
            schoolId, userId || 0, 'TIMETABLE_ENTRY', 'SWAP', entry1.id, { entry1Id: entry1.id, entry2Id: entry2.id }
        ));

        return { message: 'Entries swapped successfully' };
    }

    async moveEntry(schoolId: number, academicYearId: number, dto: { entryId: number; targetDay: any; targetTimeSlotId: number }, userId?: number) {
        const entry = await this.prisma.timetableEntry.findFirst({
            where: { id: dto.entryId, schoolId, academicYearId },
            include: { teachers: true, rooms: true, group: { include: { class: true } } }
        });

        if (!entry) throw new NotFoundException('Entry not found');
        if (entry.isLocked || entry.status === 'LOCKED') throw new BadRequestException('Cannot move a locked entry.');

        // 1. Conflict Check using enhanced Inventory Service
        const availabilityDto: any = {
            day: dto.targetDay,
            timeSlotId: dto.targetTimeSlotId,
            groupId: entry.groupId,
            teacherIds: entry.teachers.map(t => t.teacherId),
            roomIds: entry.rooms.map(r => r.roomId),
            durationSlots: entry.durationSlots,
        };

        const availability = await this.inventory.checkAvailability(schoolId, academicYearId, availabilityDto);
        if (availability.status === 'CONFLICT') throw new ConflictException(availability.message);

        // 2. Move
        await this.prisma.timetableEntry.update({
            where: { id_schoolId: { id: dto.entryId, schoolId } },
            data: { day: dto.targetDay, timeSlotId: dto.targetTimeSlotId },
        });

        this.eventEmitter.emit('audit.log', new AuditLogEvent(
            schoolId, userId || 0, 'TIMETABLE_ENTRY', 'MOVE', entry.id, dto
        ));

        return { message: 'Entry moved successfully' };
    }

    async lockEntry(schoolId: number, entryId: number, isLocked: boolean, userId?: number) {
        await this.prisma.timetableEntry.updateMany({
            where: { id: entryId, schoolId },
            data: { isLocked },
        });

        this.eventEmitter.emit('audit.log', new AuditLogEvent(
            schoolId, userId || 0, 'TIMETABLE_ENTRY', isLocked ? 'LOCK' : 'UNLOCK', entryId
        ));

        return { message: `Entry ${isLocked ? 'locked' : 'unlocked'}` };
    }

    async publishAllTimetable(schoolId: number, academicYearId: number, userId: number) {
        const result = await this.prisma.timetableEntry.updateMany({
            where: {
                schoolId,
                academicYearId,
                status: { not: 'LOCKED' }
            },
            data: { status: 'PUBLISHED', publishedAt: new Date(), publishedBy: userId },
        });

        this.eventEmitter.emit('audit.log', new AuditLogEvent(
            schoolId, userId, 'TIMETABLE_WORKFLOW', 'PUBLISH_ALL', academicYearId, { count: result.count }
        ));

        return { message: `All timetables published. Updated ${result.count} entries.` };
    }

    async publishTimetable(schoolId: number, academicYearId: number, groupId: number, userId: number) {
        const result = await this.prisma.timetableEntry.updateMany({
            where: { schoolId, academicYearId, groupId, status: { not: 'LOCKED' } },
            data: { status: 'PUBLISHED', publishedAt: new Date(), publishedBy: userId },
        });

        this.eventEmitter.emit('audit.log', new AuditLogEvent(
            schoolId, userId, 'TIMETABLE_WORKFLOW', 'PUBLISH', groupId, { count: result.count }
        ));

        return { message: `Timetable published. Updated ${result.count} entries.` };
    }

    async lockTimetable(schoolId: number, academicYearId: number, groupId: number, userId: number) {
        const result = await this.prisma.timetableEntry.updateMany({
            where: { schoolId, academicYearId, groupId },
            data: { status: 'LOCKED' },
        });

        this.eventEmitter.emit('audit.log', new AuditLogEvent(
            schoolId, userId, 'TIMETABLE_WORKFLOW', 'LOCK', groupId, { count: result.count }
        ));

        return { message: 'Timetable locked' };
    }

    async unlockTimetable(schoolId: number, academicYearId: number, groupId: number, userId: number) {
        const result = await this.prisma.timetableEntry.updateMany({
            where: { schoolId, academicYearId, groupId, status: 'LOCKED' },
            data: { status: 'PUBLISHED' },
        });

        this.eventEmitter.emit('audit.log', new AuditLogEvent(
            schoolId, userId, 'TIMETABLE_WORKFLOW', 'UNLOCK', groupId, { count: result.count }
        ));

        return { message: 'Timetable unlocked' };
    }
}
