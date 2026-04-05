import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateTimetableEntryDto } from '../dto/create-timetable-entry.dto';
import { TimetableCacheService } from './cache.service';
import { TimetableInventoryService } from './inventory.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditLogEvent } from '../../../common/audit/audit.event';

@Injectable()
export class TimetableEntryService {
    private readonly logger = new Logger(TimetableEntryService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly cacheService: TimetableCacheService,
        private readonly inventoryService: TimetableInventoryService,
        private readonly eventEmitter: EventEmitter2,
    ) { }

    async createEntry(schoolId: number, academicYearId: number, dto: CreateTimetableEntryDto, userId?: number) {
        const { groupId, teacherId, teacherIds = [], roomId, roomIds = [], subjectId, timeSlotId, day, durationSlots = 1 } = dto;
        
        // 1. Availability Check (Atomic & Deep)
        const availability = await this.inventoryService.checkAvailability(schoolId, academicYearId, dto);
        if (availability.status === 'CONFLICT') {
            throw new ConflictException(availability.message);
        }

        // 2. Resource Prep
        const allTeacherIds = [...new Set([teacherId, ...teacherIds].filter((id): id is number => !!id))];
        const allRoomIds = [...new Set([roomId, ...roomIds].filter((id): id is number => !!id))];

        // 3. Transactional Create
        const entry = await this.prisma.$transaction(async (tx) => {
            const newEntry = await tx.timetableEntry.create({
                data: {
                    schoolId,
                    academicYearId,
                    groupId,
                    subjectId,
                    teacherId: teacherId || (allTeacherIds.length > 0 ? allTeacherIds[0] : null), // Primary for legacy
                    roomId: roomId || (allRoomIds.length > 0 ? allRoomIds[0] : null), // Primary for legacy
                    day,
                    timeSlotId,
                    durationSlots,
                    isBlockStart: true,
                    isFixed: dto.isFixed || false,
                },
            });

            // Create Junctions for Multi-Teacher
            if (allTeacherIds.length > 0) {
                await tx.timetableEntryTeacher.createMany({
                    data: allTeacherIds.map(tId => ({
                        entryId: newEntry.id,
                        teacherId: tId,
                    })),
                });
            }

            // Create Junctions for Multi-Room
            if (allRoomIds.length > 0) {
                await tx.timetableEntryRoom.createMany({
                    data: allRoomIds.map(rId => ({
                        entryId: newEntry.id,
                        roomId: rId,
                    })),
                });
            }

            return newEntry;
        });

        // 4. Audit & Cache
        this.eventEmitter.emit('audit.log', new AuditLogEvent(
            schoolId, userId || 0, 'TIMETABLE_ENTRY', 'CREATE', entry.id, { ...dto, academicYearId }
        ));

        await this.cacheService.invalidateAnalyticsCache(schoolId, academicYearId);
        return entry;
    }

    async deleteEntry(schoolId: number, id: number, userId?: number) {
        const entry = await this.prisma.timetableEntry.findUnique({
            where: { id_schoolId: { id, schoolId } },
            select: { academicYearId: true, day: true, timeSlotId: true, groupId: true }
        });

        if (!entry) throw new NotFoundException('Timetable entry not found');

        const result = await this.prisma.timetableEntry.delete({
            where: { id_schoolId: { id, schoolId } },
        });

        // Audit & Cache
        this.eventEmitter.emit('audit.log', new AuditLogEvent(
            schoolId, userId || 0, 'TIMETABLE_ENTRY', 'DELETE', id, entry
        ));

        await this.cacheService.invalidateAnalyticsCache(schoolId, entry.academicYearId);
        return result;
    }

    async copyTimetableStructure(schoolId: number, fromYearId: number, toYearId: number, userId?: number) {
        const sourcePeriods = await this.prisma.timePeriod.findMany({
            where: { schoolId, academicYearId: fromYearId },
            include: { timeSlots: true },
        });

        if (sourcePeriods.length === 0) {
            throw new BadRequestException('Source academic year has no timetable structure to copy');
        }

        const result = await this.prisma.$transaction(async (tx) => {
            await tx.timePeriod.deleteMany({ where: { schoolId, academicYearId: toYearId } });

            for (const period of sourcePeriods) {
                const newPeriod = await tx.timePeriod.create({
                    data: {
                        schoolId,
                        academicYearId: toYearId,
                        name: period.name,
                        startTime: period.startTime,
                        endTime: period.endTime,
                        type: period.type,
                        days: period.days,
                        scheduleId: period.scheduleId,
                    },
                });

                if (period.timeSlots.length > 0) {
                    await tx.timeSlot.createMany({
                        data: period.timeSlots.map(slot => ({
                            schoolId,
                            academicYearId: toYearId,
                            day: slot.day,
                            startTime: slot.startTime,
                            endTime: slot.endTime,
                            isBreak: slot.isBreak,
                            periodId: newPeriod.id,
                            scheduleId: slot.scheduleId,
                        })),
                    });
                }
            }
            return { count: sourcePeriods.length };
        });

        this.eventEmitter.emit('audit.log', new AuditLogEvent(
            schoolId, userId || 0, 'TIMETABLE_STRUCTURE', 'COPY', toYearId, { fromYearId, toYearId }
        ));

        await this.cacheService.invalidateAnalyticsCache(schoolId, toYearId);
        return { message: `Successfully copied ${result.count} periods and structure.` };
    }
}
