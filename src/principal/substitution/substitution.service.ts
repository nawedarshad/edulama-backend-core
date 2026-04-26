import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ConflictException,
    Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSubstitutionDto } from './dto/create-substitution.dto';
import { UpdateSubstitutionDto } from './dto/update-substitution.dto';
import { TimetableOverrideType, DayOfWeek, AttendanceStatus, LeaveStatus, NotificationType } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationService } from '../global/notification/notification.service';
import { AuditLogEvent } from '../../common/audit/audit.event';

@Injectable()
export class SubstitutionService {
    private readonly logger = new Logger(SubstitutionService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly eventEmitter: EventEmitter2,
        private readonly notificationService: NotificationService,
    ) { }

    // ----------------------------------------------------------------
    // DATE HELPERS
    // ----------------------------------------------------------------

    // Always parse date strings as UTC midnight — never trust client timezone offset.
    private normalizeDate(dateString: string): Date {
        const [year, month, day] = dateString.split('T')[0].split('-').map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        if (isNaN(date.getTime())) {
            throw new BadRequestException(`Invalid date: "${dateString}". Expected YYYY-MM-DD.`);
        }
        return date;
    }

    private startOfDay(date: Date): Date {
        const d = new Date(date);
        d.setUTCHours(0, 0, 0, 0);
        return d;
    }

    private endOfDay(date: Date): Date {
        const d = new Date(date);
        d.setUTCHours(23, 59, 59, 999);
        return d;
    }

    private getDayOfWeek(date: Date): DayOfWeek {
        const days: DayOfWeek[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
        return days[date.getUTCDay()];
    }

    // ----------------------------------------------------------------
    // ABSENT TEACHERS
    // ----------------------------------------------------------------
    async getAbsentTeachers(schoolId: number, academicYearId: number, dateString: string) {
        const date = this.normalizeDate(dateString);
        const dayStart = this.startOfDay(date);
        const dayEnd = this.endOfDay(date);

        // Fetch leave records and attendance in parallel
        const [approvedLeaves, absentAttendance] = await Promise.all([
            this.prisma.leaveRequest.findMany({
                where: {
                    schoolId,
                    academicYearId,
                    status: LeaveStatus.APPROVED,
                    startDate: { lte: dayEnd },
                    endDate: { gte: dayStart },
                    leaveType: { category: 'TEACHER' },
                },
                include: {
                    applicant: { include: { teacherProfile: { select: { id: true } } } },
                    leaveType: { select: { name: true } },
                },
            }),
            this.prisma.staffAttendance.findMany({
                where: {
                    schoolId,
                    academicYearId,
                    date: { gte: dayStart, lte: dayEnd },
                    status: { in: [AttendanceStatus.ABSENT, AttendanceStatus.EXCUSED, AttendanceStatus.SUSPENDED] },
                },
                include: { teacher: { include: { user: { select: { name: true } } } } },
            }),
        ]);

        const leaveTeacherIds = new Set(
            approvedLeaves
                .map(l => l.applicant.teacherProfile?.id)
                .filter((id): id is number => id != null),
        );
        const attendanceMap = new Map(absentAttendance.map(a => [a.teacherId, a]));

        const uniqueAbsentIds = [...new Set([...leaveTeacherIds, ...attendanceMap.keys()])];
        if (uniqueAbsentIds.length === 0) return [];

        const absentTeachers = await this.prisma.teacherProfile.findMany({
            where: { id: { in: uniqueAbsentIds }, schoolId },
            include: { user: { select: { name: true } } },
        });

        return absentTeachers.map(teacher => {
            const leave = approvedLeaves.find(l => l.applicant.teacherProfile?.id === teacher.id);
            const attendance = attendanceMap.get(teacher.id);
            return {
                teacherId: teacher.id,
                name: teacher.user.name,
                reason: leave
                    ? `Leave: ${leave.leaveType.name}`
                    : attendance
                        ? `Attendance: ${attendance.status}`
                        : 'Unknown',
                isLeave: !!leave,
                isAttendance: !!attendance,
            };
        });
    }

    // ----------------------------------------------------------------
    // IMPACTED CLASSES
    // ----------------------------------------------------------------
    async getImpactedClasses(schoolId: number, academicYearId: number, dateString: string) {
        const date = this.normalizeDate(dateString);
        const dayStart = this.startOfDay(date);
        const dayEnd = this.endOfDay(date);
        const dayOfWeek = this.getDayOfWeek(date);

        const absentTeachers = await this.getAbsentTeachers(schoolId, academicYearId, dateString);
        const absentTeacherIds = absentTeachers.map(t => t.teacherId);

        this.logger.log(`[ImpactedClasses] ${absentTeacherIds.length} absent teachers on ${dateString}`);
        if (absentTeacherIds.length === 0) return [];

        // Round 1: impacted entries + all available teachers in parallel
        const [entries, allTeachers] = await Promise.all([
            this.prisma.timetableEntry.findMany({
                where: {
                    schoolId,
                    academicYearId,
                    teacherId: { in: absentTeacherIds },
                    day: dayOfWeek,
                    status: { in: ['PUBLISHED', 'LOCKED'] },
                },
                include: {
                    timeSlot: { include: { period: { select: { name: true } } } },
                    group: { select: { id: true, name: true } },
                    subject: { select: { id: true, name: true } },
                    teacher: { include: { user: { select: { name: true } } } },
                    timetableOverrides: {
                        where: { date: { gte: dayStart, lte: dayEnd } },
                        include: { substituteTeacher: { include: { user: { select: { name: true } } } } },
                    },
                },
                orderBy: { timeSlot: { startTime: 'asc' } },
            }),
            this.prisma.teacherProfile.findMany({
                where: { schoolId, isActive: true, user: { role: { name: 'TEACHER' } } },
                include: {
                    user: { select: { name: true } },
                    preferredSubjects: { select: { subjectId: true } },
                },
            }),
        ]);

        if (entries.length === 0) return [];

        const timeSlotIds = [...new Set(entries.map(e => e.timeSlotId))];

        // Round 2: build busy-teacher map from regular entries + active substitutions
        const [busyRegular, busySubs] = await Promise.all([
            this.prisma.timetableEntry.findMany({
                where: {
                    schoolId,
                    academicYearId,
                    day: dayOfWeek,
                    timeSlotId: { in: timeSlotIds },
                },
                select: { teacherId: true, timeSlotId: true },
            }),
            this.prisma.timetableOverride.findMany({
                where: {
                    schoolId,
                    academicYearId,
                    date: { gte: dayStart, lte: dayEnd },
                    entry: { timeSlotId: { in: timeSlotIds } },
                    substituteTeacherId: { not: null },
                },
                select: { substituteTeacherId: true, entry: { select: { timeSlotId: true } } },
            }),
        ]);

        // Map<timeSlotId, Set<teacherId>> — O(1) availability lookup
        const busyMap = new Map<number, Set<number>>();
        for (const item of busyRegular) {
            if (item.teacherId == null) continue;
            if (!busyMap.has(item.timeSlotId)) busyMap.set(item.timeSlotId, new Set());
            busyMap.get(item.timeSlotId)!.add(item.teacherId);
        }
        for (const item of busySubs) {
            if (!item.substituteTeacherId) continue;
            const tsId = item.entry.timeSlotId;
            if (!busyMap.has(tsId)) busyMap.set(tsId, new Set());
            busyMap.get(tsId)!.add(item.substituteTeacherId);
        }

        return entries.map(entry => {
            const override = entry.timetableOverrides[0] ?? null;
            let suggestions: { id: number; name: string; isSubjectMatch: boolean }[] = [];

            if (!override) {
                const busyInPeriod = busyMap.get(entry.timeSlotId) ?? new Set<number>();
                suggestions = allTeachers
                    .filter(t => !absentTeacherIds.includes(t.id) && !busyInPeriod.has(t.id))
                    .sort((a, b) => {
                        const aM = a.preferredSubjects.some(ps => ps.subjectId === entry.subjectId) ? 1 : 0;
                        const bM = b.preferredSubjects.some(ps => ps.subjectId === entry.subjectId) ? 1 : 0;
                        return bM - aM;
                    })
                    .slice(0, 3)
                    .map(t => ({
                        id: t.id,
                        name: t.user.name,
                        isSubjectMatch: t.preferredSubjects.some(ps => ps.subjectId === entry.subjectId),
                    }));
            }

            return {
                entryId: entry.id,
                timeSlotId: entry.timeSlotId, // Required by frontend to call getAvailableTeachers
                period: entry.timeSlot.period?.name ?? 'Unnamed',
                startTime: entry.timeSlot.startTime,
                endTime: entry.timeSlot.endTime,
                className: entry.group.name,
                subject: entry.subject?.name ?? 'N/A',
                originalTeacher: entry.teacher?.user?.name ?? 'N/A',
                originalTeacherId: entry.teacherId,
                isCovered: !!override,
                isCancelled: override?.type === TimetableOverrideType.CANCELLED,
                substitution: override
                    ? {
                        id: override.id,
                        type: override.type,
                        substituteTeacher: override.substituteTeacher?.user?.name ?? null,
                        substituteTeacherId: override.substituteTeacherId,
                        note: override.note,
                    }
                    : null,
                suggestions,
            };
        });
    }

    // ----------------------------------------------------------------
    // AVAILABLE TEACHERS
    // ----------------------------------------------------------------
    async getAvailableTeachers(
        schoolId: number,
        academicYearId: number,
        dateString: string,
        timeSlotId: number,
    ) {
        const date = this.normalizeDate(dateString);
        const dayStart = this.startOfDay(date);
        const dayEnd = this.endOfDay(date);
        const dayOfWeek = this.getDayOfWeek(date);

        const [absentTeachers, busyEntries, substitutingTeachers] = await Promise.all([
            this.getAbsentTeachers(schoolId, academicYearId, dateString),
            this.prisma.timetableEntry.findMany({
                where: {
                    schoolId,
                    academicYearId,
                    day: dayOfWeek,
                    timeSlotId,
                    status: { in: ['PUBLISHED', 'LOCKED'] },
                },
                select: { id: true, teacherId: true },
            }),
            this.prisma.timetableOverride.findMany({
                where: {
                    schoolId,
                    academicYearId,
                    date: { gte: dayStart, lte: dayEnd },
                    entry: { timeSlotId },
                    substituteTeacherId: { not: null },
                },
                select: { substituteTeacherId: true },
            }),
        ]);

        const absentTeacherIds = absentTeachers.map(t => t.teacherId);
        const busyEntryIds = busyEntries.map(e => e.id);

        // Teachers freed from their regular class by any override on this date are available
        const freeingOverrides = await this.prisma.timetableOverride.findMany({
            where: {
                schoolId,
                academicYearId,
                date: { gte: dayStart, lte: dayEnd },
                entryId: { in: busyEntryIds },
            },
            select: { entryId: true },
        });

        const freedEntryIds = new Set(freeingOverrides.map(o => o.entryId));
        const busyTeacherIds = busyEntries
            .filter(e => !freedEntryIds.has(e.id))
            .map(e => e.teacherId);
        const substitutingTeacherIds = substitutingTeachers
            .map(t => t.substituteTeacherId)
            .filter((id): id is number => id != null);

        const unavailableIds = [
            ...new Set([...absentTeacherIds, ...busyTeacherIds, ...substitutingTeacherIds]),
        ].filter((id): id is number => id != null);

        const available = await this.prisma.teacherProfile.findMany({
            where: {
                schoolId,
                isActive: true,
                id: { notIn: unavailableIds },
                user: { role: { name: 'TEACHER' } },
            },
            include: {
                user: { select: { name: true } },
                preferredSubjects: { include: { subject: { select: { name: true } } } },
            },
        });

        return available.map(t => ({
            id: t.id,
            name: t.user?.name ?? 'Unknown',
            subjects: t.preferredSubjects.map(ps => ps.subject.name).join(', '),
        }));
    }

    // ----------------------------------------------------------------
    // CREATE SUBSTITUTION
    // ----------------------------------------------------------------
    async createSubstitution(
        userId: number,
        schoolId: number,
        academicYearId: number,
        dto: CreateSubstitutionDto,
    ) {
        // 1. Validate entry belongs to school (IDOR-safe: findFirst with schoolId)
        const entry = await this.prisma.timetableEntry.findFirst({
            where: { id: dto.entryId, schoolId },
            select: { id: true, timeSlotId: true },
        });
        if (!entry) throw new NotFoundException('Timetable entry not found');

        const date = this.normalizeDate(dto.date);
        const dayStart = this.startOfDay(date);
        const dayEnd = this.endOfDay(date);
        const dayOfWeek = this.getDayOfWeek(date);
        const type = dto.type ?? TimetableOverrideType.SUBSTITUTE;

        // 2. Prevent duplicate override for the same entry+date
        const existing = await this.prisma.timetableOverride.findFirst({
            where: { schoolId, entryId: dto.entryId, date: { gte: dayStart, lte: dayEnd } },
        });
        if (existing) {
            throw new ConflictException('A substitution already exists for this slot. Delete or update it first.');
        }

        let substituteTeacherUserId: number | null = null;

        if (type === TimetableOverrideType.SUBSTITUTE && dto.substituteTeacherId) {
            // 3. Validate substitute teacher belongs to school (IDOR-safe)
            const subTeacher = await this.prisma.teacherProfile.findFirst({
                where: { id: dto.substituteTeacherId, schoolId },
                select: { id: true, userId: true },
            });
            if (!subTeacher) throw new BadRequestException('Invalid substitute teacher selected.');
            substituteTeacherUserId = subTeacher.userId;

            // 4. Check if substitute has a regular class at this time
            //    Covers BOTH primary teacher (teacherId) and secondary teachers (EntryTeacher junction)
            const busyRegular = await this.prisma.timetableEntry.findFirst({
                where: {
                    schoolId,
                    academicYearId,
                    day: dayOfWeek,
                    timeSlotId: entry.timeSlotId,
                    status: { in: ['PUBLISHED', 'LOCKED'] },
                    OR: [
                        { teacherId: dto.substituteTeacherId },
                        { teachers: { some: { teacherId: dto.substituteTeacherId } } },
                    ],
                },
            });

            if (busyRegular) {
                const isFreedUp = await this.prisma.timetableOverride.findFirst({
                    where: {
                        schoolId,
                        entryId: busyRegular.id,
                        date: { gte: dayStart, lte: dayEnd },
                    },
                });
                if (!isFreedUp) {
                    throw new BadRequestException('Substitute teacher has a regular class at this time.');
                }
                if (isFreedUp.type === TimetableOverrideType.SUBSTITUTE) {
                    throw new BadRequestException('Substitute teacher is themselves being substituted at this time.');
                }
                // type === CANCELLED → original class freed, teacher is available
            }

            // 5. Check if substitute is already assigned to another class in this period
            const busySub = await this.prisma.timetableOverride.findFirst({
                where: {
                    schoolId,
                    date: { gte: dayStart, lte: dayEnd },
                    substituteTeacherId: dto.substituteTeacherId,
                    entry: { timeSlotId: entry.timeSlotId },
                },
            });
            if (busySub) {
                throw new BadRequestException('Substitute teacher is already assigned to another class in this period.');
            }
        }

        // 6. Validate substitute room belongs to school (IDOR-safe)
        if (dto.substituteRoomId) {
            const room = await this.prisma.room.findFirst({
                where: { id: dto.substituteRoomId, schoolId },
                select: { id: true },
            });
            if (!room) throw new BadRequestException('Invalid substitute room selected.');
        }

        // 7. Create — catch P2002 from concurrent duplicate requests slipping past soft check
        let substitution: any;
        try {
            substitution = await this.prisma.timetableOverride.create({
                data: {
                    schoolId,
                    academicYearId,
                    entryId: dto.entryId,
                    date,
                    type,
                    substituteTeacherId: type === TimetableOverrideType.CANCELLED ? null : (dto.substituteTeacherId ?? null),
                    substituteRoomId: type === TimetableOverrideType.CANCELLED ? null : (dto.substituteRoomId ?? null),
                    note: dto.note,
                    createdById: userId,
                },
            });
        } catch (error: any) {
            if (error?.code === 'P2002') {
                throw new ConflictException('A substitution already exists for this slot (concurrent request conflict).');
            }
            throw error;
        }

        // 8. Audit trail
        this.eventEmitter.emit('audit.log', new AuditLogEvent(schoolId, userId, 'SUBSTITUTION', 'CREATE', substitution.id, dto));

        // 9. Notify substitute teacher (best-effort: don't fail the HTTP response if push fails)
        if (type === TimetableOverrideType.SUBSTITUTE && dto.substituteTeacherId && substituteTeacherUserId) {
            try {
                await this.notificationService.create(schoolId, userId, {
                    type: NotificationType.SYSTEM,
                    title: 'Substitution Assignment',
                    message: `You have been assigned as a substitute teacher. Please check your schedule.`,
                    targetUserIds: [substituteTeacherUserId],
                    data: { substitutionId: substitution.id, entryId: dto.entryId, date: dto.date },
                });
            } catch (err: any) {
                this.logger.error(`Substitution #${substitution.id}: failed to notify substitute teacher — ${err.message}`);
            }
        }

        return substitution;
    }

    // ----------------------------------------------------------------
    // UPDATE SUBSTITUTION
    // ----------------------------------------------------------------
    async updateSubstitution(schoolId: number, id: number, dto: UpdateSubstitutionDto, userId?: number) {
        // IDOR-safe: findFirst with schoolId
        const existing = await this.prisma.timetableOverride.findFirst({
            where: { id, schoolId },
            include: { entry: { select: { timeSlotId: true, academicYearId: true } } },
        });
        if (!existing) throw new NotFoundException('Substitution not found');

        const resolvedType = dto.type ?? existing.type;

        // When type switches to CANCELLED, always clear teacher/room — no orphaned assignments
        if (resolvedType === TimetableOverrideType.CANCELLED) {
            const updated = await this.prisma.timetableOverride.update({
                where: { id },
                data: {
                    type: TimetableOverrideType.CANCELLED,
                    substituteTeacherId: null,
                    substituteRoomId: null,
                    note: dto.note ?? existing.note,
                },
            });
            if (userId) {
                this.eventEmitter.emit('audit.log', new AuditLogEvent(schoolId, userId, 'SUBSTITUTION', 'UPDATE', id, dto));
            }
            return updated;
        }

        const date = existing.date;
        const dayStart = this.startOfDay(date);
        const dayEnd = this.endOfDay(date);
        const dayOfWeek = this.getDayOfWeek(date);

        // Validate new substitute teacher only if actually changed
        if (dto.substituteTeacherId != null && dto.substituteTeacherId !== existing.substituteTeacherId) {
            // IDOR-safe
            const subTeacher = await this.prisma.teacherProfile.findFirst({
                where: { id: dto.substituteTeacherId, schoolId },
                select: { id: true },
            });
            if (!subTeacher) throw new BadRequestException('Invalid substitute teacher selected.');

            // Regular class conflict — includes secondary teacher check
            const busyRegular = await this.prisma.timetableEntry.findFirst({
                where: {
                    schoolId,
                    academicYearId: existing.entry.academicYearId,
                    day: dayOfWeek,
                    timeSlotId: existing.entry.timeSlotId,
                    status: { in: ['PUBLISHED', 'LOCKED'] },
                    OR: [
                        { teacherId: dto.substituteTeacherId },
                        { teachers: { some: { teacherId: dto.substituteTeacherId } } },
                    ],
                },
            });

            if (busyRegular) {
                const isFreedUp = await this.prisma.timetableOverride.findFirst({
                    where: {
                        schoolId,
                        entryId: busyRegular.id,
                        date: { gte: dayStart, lte: dayEnd },
                    },
                });
                if (!isFreedUp) {
                    throw new BadRequestException('Substitute teacher has a regular class at this time.');
                }
                if (isFreedUp.type === TimetableOverrideType.SUBSTITUTE) {
                    throw new BadRequestException('Substitute teacher is themselves being substituted at this time.');
                }
            }

            // Other substitution conflicts — exclude self (id: { not: id })
            const busySub = await this.prisma.timetableOverride.findFirst({
                where: {
                    schoolId,
                    date: { gte: dayStart, lte: dayEnd },
                    substituteTeacherId: dto.substituteTeacherId,
                    entry: { timeSlotId: existing.entry.timeSlotId },
                    id: { not: id },
                },
            });
            if (busySub) {
                throw new BadRequestException('Substitute teacher is already assigned to another class in this period.');
            }
        }

        // Validate room belongs to school only if changed
        if (dto.substituteRoomId != null && dto.substituteRoomId !== existing.substituteRoomId) {
            const room = await this.prisma.room.findFirst({
                where: { id: dto.substituteRoomId, schoolId },
                select: { id: true },
            });
            if (!room) throw new BadRequestException('Invalid substitute room selected.');
        }

        // Whitelist: only the fields this DTO carries — entryId and date are immutable
        const updated = await this.prisma.timetableOverride.update({
            where: { id },
            data: {
                ...(dto.type !== undefined ? { type: dto.type } : {}),
                ...(dto.substituteTeacherId !== undefined ? { substituteTeacherId: dto.substituteTeacherId } : {}),
                ...(dto.substituteRoomId !== undefined ? { substituteRoomId: dto.substituteRoomId } : {}),
                ...(dto.note !== undefined ? { note: dto.note } : {}),
            },
        });

        if (userId) {
            this.eventEmitter.emit('audit.log', new AuditLogEvent(schoolId, userId, 'SUBSTITUTION', 'UPDATE', id, dto));
        }

        return updated;
    }

    // ----------------------------------------------------------------
    // DELETE SUBSTITUTION
    // ----------------------------------------------------------------
    async deleteSubstitution(schoolId: number, id: number, userId?: number) {
        // IDOR-safe: findFirst with schoolId
        const sub = await this.prisma.timetableOverride.findFirst({
            where: { id, schoolId },
        });
        if (!sub) throw new NotFoundException('Substitution not found');

        const deleted = await this.prisma.timetableOverride.delete({ where: { id } });

        if (userId) {
            this.eventEmitter.emit('audit.log', new AuditLogEvent(schoolId, userId, 'SUBSTITUTION', 'DELETE', id));
        }

        return deleted;
    }

    // ----------------------------------------------------------------
    // GET SUBSTITUTIONS (paginated)
    // ----------------------------------------------------------------
    async getSubstitutions(
        schoolId: number,
        academicYearId: number,
        dateString?: string,
        page = 1,
        limit = 50,
    ) {
        const where: any = { schoolId, academicYearId };

        if (dateString) {
            const date = this.normalizeDate(dateString);
            where.date = { gte: this.startOfDay(date), lte: this.endOfDay(date) };
        }

        const skip = (page - 1) * limit;

        const [overrides, total] = await Promise.all([
            this.prisma.timetableOverride.findMany({
                where,
                include: {
                    substituteTeacher: { include: { user: { select: { name: true } } } },
                    entry: {
                        include: {
                            group: { select: { name: true } },
                            subject: { select: { name: true } },
                            timeSlot: {
                                include: { period: { select: { name: true } } },
                            },
                            teacher: { include: { user: { select: { name: true } } } },
                        },
                    },
                },
                orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
                take: limit,
                skip,
            }),
            this.prisma.timetableOverride.count({ where }),
        ]);

        return {
            data: overrides.map(o => ({
                id: o.id,
                date: o.date,
                type: o.type,
                originalTeacher: o.entry.teacher?.user?.name ?? 'N/A',
                substituteTeacher: o.substituteTeacher?.user?.name ?? null,
                className: o.entry.group.name,
                subject: o.entry.subject?.name ?? 'N/A',
                period: `${o.entry.timeSlot.period?.name ?? 'Unnamed'} (${o.entry.timeSlot.startTime})`,
                note: o.note,
            })),
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    // ----------------------------------------------------------------
    // TEACHER SUBSTITUTION HISTORY
    // ----------------------------------------------------------------
    async getTeacherSubstitutionHistory(
        schoolId: number,
        teacherId: number,
        academicYearId: number,
        dateString?: string,
        limit = 200,
    ) {
        // IDOR-safe: findFirst with schoolId
        const teacher = await this.prisma.teacherProfile.findFirst({
            where: { id: teacherId, schoolId },
            include: {
                user: { select: { name: true } },
                preferredSubjects: { include: { subject: { select: { name: true } } } },
            },
        });
        if (!teacher) throw new NotFoundException('Teacher not found');

        const substitutions = await this.prisma.timetableOverride.findMany({
            where: { schoolId, academicYearId, substituteTeacherId: teacherId },
            include: {
                entry: {
                    include: {
                        group: { select: { name: true } },
                        subject: { select: { name: true } },
                        timeSlot: { include: { period: { select: { name: true } } } },
                        teacher: { include: { user: { select: { name: true } } } },
                    },
                },
            },
            orderBy: { date: 'desc' },
            take: limit,
        });

        const pivotDate = dateString
            ? this.normalizeDate(dateString)
            : this.normalizeDate(new Date().toISOString().split('T')[0]);
        const pivotStart = this.startOfDay(pivotDate).getTime();
        const pivotEnd = this.endOfDay(pivotDate).getTime();

        const past: any[] = [];
        const active: any[] = [];
        const upcoming: any[] = [];

        for (const sub of substitutions) {
            const t = sub.date.getTime();
            const item = {
                id: sub.id,
                date: sub.date,
                period: `${sub.entry.timeSlot.period?.name ?? 'Unnamed'} (${sub.entry.timeSlot.startTime})`,
                className: sub.entry.group.name,
                subject: sub.entry.subject?.name ?? 'N/A',
                originalTeacher: sub.entry.teacher?.user?.name ?? 'N/A',
                note: sub.note,
            };
            if (t < pivotStart) past.push(item);
            else if (t > pivotEnd) upcoming.push(item);
            else active.push(item);
        }

        const uniqueSubjects = [...new Set(substitutions.map(s => s.entry.subject?.name).filter(Boolean))];

        return {
            teacher: {
                id: teacher.id,
                name: teacher.user.name,
                subjects: teacher.preferredSubjects.map(ps => ps.subject.name).join(', '),
            },
            stats: {
                totalSubstitutions: substitutions.length,
                subjectsCovered: uniqueSubjects.join(', '),
            },
            active,
            upcoming,
            past,
        };
    }
}
