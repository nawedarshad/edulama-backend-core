import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateTimePeriodDto } from './dto/create-time-period.dto';
import { CreateTimetableEntryDto } from './dto/create-timetable-entry.dto';
import { DayOfWeek } from '@prisma/client';

@Injectable()
export class TimetableService {
    constructor(private readonly prisma: PrismaService) { }

    // ----------------------------------------------------------------
    // TIME PERIODS
    // ----------------------------------------------------------------

    async createTimePeriod(schoolId: number, academicYearId: number, dto: CreateTimePeriodDto) {
        // Check Lock
        await this.checkYearLock(schoolId, academicYearId);

        // Validate scheduleId if provided
        if (dto.scheduleId) {
            const schedule = await this.prisma.schedule.findFirst({
                where: { id: dto.scheduleId, schoolId, academicYearId },
            });
            if (!schedule) {
                throw new BadRequestException('Invalid schedule ID');
            }
        }

        // Check for time overlaps within the same schedule
        await this.validateTimeOverlap(schoolId, academicYearId, dto.scheduleId, dto.startTime, dto.endTime);

        // Check if name already exists in this schedule
        const existing = await this.prisma.timePeriod.findFirst({
            where: {
                schoolId,
                academicYearId,
                scheduleId: dto.scheduleId,
                name: dto.name
            },
        });
        if (existing) {
            throw new ConflictException('Time period with this name already exists in this schedule');
        }

        const period = await this.prisma.timePeriod.create({
            data: {
                schoolId,
                academicYearId,
                ...dto,
            },
        });

        // Sync TimeSlots
        if (dto.days && dto.days.length > 0) {
            await this.syncTimeSlots(schoolId, academicYearId, period.id, dto.days);
        }

        return period;
    }

    async findAllTimePeriods(schoolId: number, academicYearId: number) {
        return this.prisma.timePeriod.findMany({
            where: { schoolId, academicYearId },
            orderBy: { startTime: 'asc' },
            include: { timeSlots: true },
        });
    }

    async updateTimePeriod(schoolId: number, academicYearId: number, id: number, dto: CreateTimePeriodDto) {
        await this.checkYearLock(schoolId, academicYearId);

        // Get existing period to check scheduleId
        const existingPeriod = await this.prisma.timePeriod.findFirst({
            where: { id, schoolId },
        });
        if (!existingPeriod) {
            throw new NotFoundException('Time period not found');
        }

        // Validate time overlap (excluding current period)
        const scheduleId = dto.scheduleId ?? existingPeriod.scheduleId;
        await this.validateTimeOverlap(
            schoolId,
            academicYearId,
            scheduleId,
            dto.startTime ?? existingPeriod.startTime,
            dto.endTime ?? existingPeriod.endTime,
            id // exclude this period from overlap check
        );

        const period = await this.prisma.timePeriod.update({
            where: { id },
            data: dto,
        });

        if (dto.days) {
            await this.syncTimeSlots(schoolId, academicYearId, period.id, dto.days);
        }
        return period;
    }

    async deleteTimePeriod(schoolId: number, id: number) {
        // Need to check lock for the period's year. 
        // Likely we should pass academicYearId to delete, or fetch it.
        // For now assuming caller checks lock if they have the year ID.
        // Ideally controller passes yearId.
        return this.prisma.timePeriod.delete({
            where: { id },
        });
    }

    // Helper to sync TimeSlots
    private async syncTimeSlots(schoolId: number, academicYearId: number, periodId: number, days: any[]) {
        // 1. Delete existing slots for this period (simple reset approach)
        // Be careful: if we preserve entries, we shouldn't delete slots that have entries?
        // Ideally we wipe slots for this period and recreate. 
        // But if entries depend on slots via foreign key? 
        // entries -> periodId. entries -> timeSlotId (optional).
        // TimetableEntry has timeSlotId optional. Relation is to Period.
        // But TimeSlot has @@unique constraint.

        await this.prisma.timeSlot.deleteMany({
            where: { schoolId, academicYearId, periodId },
        });

        // 2. Create new slots
        const data = days.map(day => ({
            schoolId,
            academicYearId,
            periodId,
            day,
        }));

        if (data.length > 0) {
            await this.prisma.timeSlot.createMany({ data });
        }
    }



    // ----------------------------------------------------------------
    // TIMETABLE ENTRIES
    // ----------------------------------------------------------------

    async createEntry(
        schoolId: number,
        academicYearId: number,
        dto: CreateTimetableEntryDto,
    ) {
        // 0. CHECK LOCK
        await this.checkYearLock(schoolId, academicYearId);

        // ----------------------------------------------------------------
        // 0.1 CHECK WORKING DAY (STRICT)
        // ----------------------------------------------------------------
        // Using findUnique for better performance (requires @@unique check in schema)
        const workingPattern = await this.prisma.workingPattern.findUnique({
            where: {
                schoolId_academicYearId_dayOfWeek: {
                    schoolId,
                    academicYearId,
                    dayOfWeek: dto.day,
                },
            },
        });

        // Use strict check: If pattern exists AND is marked as invalid/holiday
        if (workingPattern && !workingPattern.isWorking) {
            throw new BadRequestException(
                `Cannot schedule on ${dto.day} as it is marked as a holiday.`
            );
        }

        // ----------------------------------------------------------------
        // 0.1 CHECK VALID TIME SLOT (Dynamic Days)
        // ----------------------------------------------------------------
        const validSlot = await this.prisma.timeSlot.findFirst({
            where: {
                schoolId,
                academicYearId,
                periodId: dto.periodId,
                day: dto.day,
            }
        });

        if (!validSlot) {
            throw new BadRequestException(
                `Time Period is not configured for ${dto.day}.`
            );
        }

        // ----------------------------------------------------------------
        // 1. CHECK CONFLICTS
        // ----------------------------------------------------------------

        // Check Teacher Availability
        const teacherConflict = await this.prisma.timetableEntry.findFirst({
            where: {
                schoolId,
                academicYearId,
                teacherId: dto.teacherId,
                day: dto.day,
                periodId: dto.periodId,
            },
            include: { class: true, section: true },
        });

        if (teacherConflict) {
            throw new ConflictException(
                `Teacher is already assigned to ${teacherConflict.class.name} - ${teacherConflict.section.name} at this time.`,
            );
        }

        // Check Section Availability
        const sectionConflict = await this.prisma.timetableEntry.findFirst({
            where: {
                schoolId,
                academicYearId,
                sectionId: dto.sectionId,
                day: dto.day,
                periodId: dto.periodId,
            },
        });

        if (sectionConflict) {
            throw new ConflictException(
                'This section already has a class scheduled at this time.',
            );
        }

        // Check Room Availability (if room provided)
        if (dto.roomId) {
            const roomConflict = await this.prisma.timetableEntry.findFirst({
                where: {
                    schoolId,
                    academicYearId,
                    roomId: dto.roomId,
                    day: dto.day,
                    periodId: dto.periodId,
                },
            });
            if (roomConflict) {
                throw new ConflictException('Room is already booked at this time.');
            }
        }

        return this.prisma.timetableEntry.create({
            data: {
                schoolId,
                academicYearId,
                ...dto,
            },
        });
    }

    async getTimetableForSection(
        schoolId: number,
        academicYearId: number,
        sectionId: number,
    ) {
        return this.prisma.timetableEntry.findMany({
            where: {
                schoolId,
                academicYearId,
                sectionId,
            },
            include: {
                subject: true,
                teacher: {
                    select: {
                        id: true,
                        user: {
                            select: {
                                id: true,
                                name: true,
                                authIdentities: {
                                    where: { type: 'EMAIL' },
                                    select: { value: true }
                                }
                            }
                        }
                    }
                },
                period: true,
                room: true,
            },
            orderBy: [{ day: 'asc' }, { period: { startTime: 'asc' } }],
        });
    }

    // ----------------------------------------------------------------
    // SMART SYSTEMS & ANALYTICS
    // ----------------------------------------------------------------

    /**
     * Find available teachers for a specific slot.
     */
    async findFreeTeachers(
        schoolId: number,
        academicYearId: number,
        day: DayOfWeek,
        periodId: number,
        subjectId?: number,
    ) {
        // 1. Get all active teachers
        const allTeachers = await this.prisma.teacherProfile.findMany({
            where: { schoolId, isActive: true },
            select: {
                id: true,
                user: { select: { name: true } },
                preferredSubjects: { select: { subjectId: true } },
            },
        });

        // 2. Get IDs of teachers busy at this time
        const busyEntries = await this.prisma.timetableEntry.findMany({
            where: {
                schoolId,
                academicYearId,
                day,
                periodId,
            },
            select: { teacherId: true },
        });
        const busyTeacherIds = new Set(busyEntries.map((e) => e.teacherId));

        // 3. Filter
        const freeTeachers = allTeachers.filter((t) => !busyTeacherIds.has(t.id));

        // 4. If subjectId provided, rank by expertise
        if (subjectId) {
            return freeTeachers.map((t) => ({
                ...t,
                isSubjectSpecialist: t.preferredSubjects.some(
                    (ps) => ps.subjectId === subjectId,
                ),
            })).sort((a, b) => Number(b.isSubjectSpecialist) - Number(a.isSubjectSpecialist));
        }

        return freeTeachers;
    }

    async findFreeRooms(
        schoolId: number,
        academicYearId: number,
        day: DayOfWeek,
        periodId: number,
    ) {
        const allRooms = await this.prisma.room.findMany({
            where: { schoolId },
        });

        const busyEntries = await this.prisma.timetableEntry.findMany({
            where: {
                schoolId,
                academicYearId,
                day,
                periodId,
                roomId: { not: null },
            },
            select: { roomId: true },
        });
        const busyRoomIds = new Set(busyEntries.map((e) => e.roomId));

        return allRooms.filter((r) => !busyRoomIds.has(r.id));
    }

    async getTeacherWorkloadAnalytics(schoolId: number, academicYearId: number) {
        const entries = await this.prisma.timetableEntry.groupBy({
            by: ['teacherId'],
            where: { schoolId, academicYearId },
            _count: {
                id: true,
            },
        });

        const teacherIds = entries.map((e) => e.teacherId);
        const teachers = await this.prisma.teacherProfile.findMany({
            where: { id: { in: teacherIds } },
            select: { id: true, user: { select: { name: true } } },
        });

        return entries.map((e) => {
            const teacher = teachers.find((t) => t.id === e.teacherId);
            return {
                teacherName: teacher?.user?.name || 'Unknown',
                totalPeriods: e._count.id,
            };
        });
    }

    async getClassSubjectDistribution(
        schoolId: number,
        academicYearId: number,
        classId: number,
        sectionId: number,
    ) {
        const distribution = await this.prisma.timetableEntry.groupBy({
            by: ['subjectId'],
            where: { schoolId, academicYearId, classId, sectionId },
            _count: { id: true },
        });

        const subjects = await this.prisma.subject.findMany({
            where: { id: { in: distribution.map((d) => d.subjectId) } },
        });

        return distribution.map((d) => ({
            subjectName: subjects.find((s) => s.id === d.subjectId)?.name,
            count: d._count.id,
        }));
    }

    async getComprehensiveAnalytics(schoolId: number, academicYearId: number) {
        const teacherWorkload = await this.getTeacherWorkloadAnalytics(schoolId, academicYearId);

        // Count total entries/scheduled classes
        const totalScheduled = await this.prisma.timetableEntry.count({
            where: { schoolId, academicYearId },
        });

        const activeTeachers = await this.prisma.teacherProfile.count({
            where: { schoolId, isActive: true },
        });

        // Most busy day?
        const entriesByDay = await this.prisma.timetableEntry.groupBy({
            by: ['day'],
            where: { schoolId, academicYearId },
            _count: { id: true },
        });

        return {
            teacherWorkload,
            stats: {
                totalScheduledClasses: totalScheduled,
                activeTeachers,
            },
            dayDistribution: entriesByDay.map(d => ({ day: d.day, count: d._count.id }))
        };
    }

    /**
     * Dry Run: Check availability without creating
     */
    async checkAvailability(
        schoolId: number,
        academicYearId: number,
        dto: CreateTimetableEntryDto,
    ): Promise<{ status: 'OK' | 'CONFLICT'; message?: string }> {
        // Check Working Day
        const workingPattern = await this.prisma.workingPattern.findUnique({
            where: {
                schoolId_academicYearId_dayOfWeek: {
                    schoolId,
                    academicYearId,
                    dayOfWeek: dto.day,
                },
            },
        });

        if (workingPattern && !workingPattern.isWorking) {
            return { status: 'CONFLICT', message: `Holiday (${dto.day})` };
        }

        // Check Valid Slot
        const validSlot = await this.prisma.timeSlot.findFirst({
            where: {
                schoolId,
                academicYearId,
                periodId: dto.periodId,
                day: dto.day,
            }
        });
        if (!validSlot) {
            return { status: 'CONFLICT', message: `Invalid Slot (${dto.day})` };
        }

        // Check Teacher
        const teacherConflict = await this.prisma.timetableEntry.findFirst({
            where: {
                schoolId,
                academicYearId,
                teacherId: dto.teacherId,
                day: dto.day,
                periodId: dto.periodId,
            },
        });
        if (teacherConflict) return { status: 'CONFLICT', message: 'Teacher Busy' };

        // Check Section
        const sectionConflict = await this.prisma.timetableEntry.findFirst({
            where: {
                schoolId,
                academicYearId,
                sectionId: dto.sectionId,
                day: dto.day,
                periodId: dto.periodId,
            },
        });
        if (sectionConflict) return { status: 'CONFLICT', message: 'Class Busy' };

        // Check Room
        if (dto.roomId) {
            const roomConflict = await this.prisma.timetableEntry.findFirst({
                where: {
                    schoolId,
                    academicYearId,
                    roomId: dto.roomId,
                    day: dto.day,
                    periodId: dto.periodId,
                },
            });
            if (roomConflict) return { status: 'CONFLICT', message: 'Room Busy' };
        }

        return { status: 'OK' };
    }



    async getTimetableForRoom(
        schoolId: number,
        academicYearId: number,
        roomId: number,
    ) {
        return this.prisma.timetableEntry.findMany({
            where: { schoolId, academicYearId, roomId },
            include: {
                subject: true,
                teacher: {
                    select: {
                        id: true,
                        user: {
                            select: {
                                id: true,
                                name: true,
                                authIdentities: {
                                    where: { type: 'EMAIL' },
                                    select: { value: true }
                                }
                            }
                        }
                    }
                },
                period: true,
                section: { select: { id: true, name: true, class: { select: { name: true } } } },
            },
            orderBy: [{ day: 'asc' }, { period: { startTime: 'asc' } }],
        });
    }
    async getTimetableForTeacher(
        schoolId: number,
        academicYearId: number,
        teacherId: number,
    ) {
        return this.prisma.timetableEntry.findMany({
            where: {
                schoolId,
                academicYearId,
                teacherId,
            },
            include: {
                subject: true,
                class: true,
                section: true,
                period: true,
                room: true,
            },
            orderBy: [{ day: 'asc' }, { period: { startTime: 'asc' } }],
        });
    }

    async deleteEntry(schoolId: number, id: number) {
        // 1. Fetch Entry
        const entry = await this.prisma.timetableEntry.findFirst({
            where: { id, schoolId },
        });

        if (!entry) throw new NotFoundException('Entry not found');

        // 2. Check Lock
        if (entry.isLocked || entry.status === 'LOCKED') {
            throw new BadRequestException('Cannot delete a locked entry.');
        }

        // 3. Delete
        return this.prisma.timetableEntry.delete({
            where: { id }
        });
    }

    async getTimetableContext(
        schoolId: number,
        academicYearId: number,
        classId: number,
        sectionId: number,
    ) {

        // 0. Get Class to determine scheduleId
        const classInfo = await this.prisma.class.findFirst({
            where: { id: classId, schoolId },
            select: { scheduleId: true },
        });

        if (!classInfo) {
            throw new NotFoundException('Class not found');
        }

        // 1. Get Default Room
        const roomAssignment = await this.prisma.roomAssignment.findFirst({
            where: {
                schoolId,
                academicYearId,
                sectionId,
                isActive: true,
            },
            include: { room: true },
        });

        // 1.1 Get Valid Time Periods (Filtered by Class's Schedule)
        const timeSlots = await this.prisma.timeSlot.findMany({
            where: {
                schoolId,
                academicYearId,
                period: {
                    scheduleId: classInfo.scheduleId, // Filter by class's schedule
                },
            },
            include: { period: true },
            orderBy: { period: { startTime: 'asc' } }
        });

        // Group slots by day
        const calendar = {};
        for (const slot of timeSlots) {
            if (!calendar[slot.day]) calendar[slot.day] = [];
            calendar[slot.day].push({
                ...slot.period,
                slotId: slot.id,
                isBreak: slot.isBreak,
                // description: slot.description // REMOVED
            });
        }

        // 2. Get Subject Allocations
        const subjectAssignments = await this.prisma.subjectAssignment.findMany({
            where: {
                schoolId,
                academicYearId,
                classId,
                sectionId,
                isActive: true,
            },
            include: {
                subject: true,
                teacher: { select: { id: true, user: { select: { name: true } } } },
            },
        });

        // 3. Existing Entries
        const entries = await this.prisma.timetableEntry.findMany({
            where: {
                schoolId,
                academicYearId,
                sectionId,
            },
            include: {
                subject: true,
                teacher: { select: { id: true, user: { select: { name: true } } } },
                room: true,
                period: true,
            },
        });

        // 4. All Rooms
        const allRooms = await this.prisma.room.findMany({
            where: { schoolId },
            orderBy: { name: 'asc' },
        });

        return {
            defaultRoom: roomAssignment?.room || null,
            rooms: allRooms,
            calendar, // Dynamic days/periods structure
            scheduleId: classInfo.scheduleId, // Schedule assigned to this class
            allocations: subjectAssignments.map((sa) => ({
                subjectId: sa.subjectId,
                subjectName: sa.subject.name,
                subjectCode: sa.subject.code,
                teacherId: sa.teacherId,
                teacherName: sa.teacher?.user?.name || 'Unassigned',
                color: sa.subject.color,
            })),
            entries,
        };
    }
    // ----------------------------------------------------------------
    // COPY TIMETABLE
    // ----------------------------------------------------------------
    async copyTimetableStructure(schoolId: number, fromYearId: number, toYearId: number) {
        // 1. Check Locks
        await this.checkYearLock(schoolId, toYearId);

        // 1.1 Validate Source Year
        const sourceYear = await this.prisma.academicYear.findFirst({
            where: { id: fromYearId, schoolId },
        });
        if (!sourceYear) {
            throw new BadRequestException('Source Academic Year search failed. Ensure the year exists and belongs to your school.');
        }

        // 2. Fetch Source Periods
        const sourcePeriods = await this.prisma.timePeriod.findMany({
            where: { schoolId, academicYearId: fromYearId },
            include: { timeSlots: true },
        });

        if (sourcePeriods.length === 0) {
            throw new NotFoundException('No periods found in the source academic year.');
        }

        // 3. Create Targets
        await this.prisma.$transaction(async (tx) => {
            for (const p of sourcePeriods) {
                // Create Period config copy
                const newPeriod = await tx.timePeriod.create({
                    data: {
                        schoolId,
                        academicYearId: toYearId,
                        name: p.name,
                        startTime: p.startTime,
                        endTime: p.endTime,
                        type: p.type,
                        days: p.days,
                    }
                });

                // Create Slots for this period
                if (p.timeSlots.length > 0) {
                    await tx.timeSlot.createMany({
                        data: p.timeSlots.map(slot => ({
                            schoolId,
                            academicYearId: toYearId,
                            periodId: newPeriod.id,
                            day: slot.day,
                            isBreak: slot.isBreak,
                        }))
                    });
                }
            }
        });

        return { message: `Successfully copied ${sourcePeriods.length} periods and structure.` };
    }

    // ----------------------------------------------------------------
    // HELPER: Time Overlap Validation
    // ----------------------------------------------------------------
    private async validateTimeOverlap(
        schoolId: number,
        academicYearId: number,
        scheduleId: number | null | undefined,
        startTime: string,
        endTime: string,
        excludePeriodId?: number
    ) {
        // Get all periods in the same schedule
        const existingPeriods = await this.prisma.timePeriod.findMany({
            where: {
                schoolId,
                academicYearId,
                scheduleId: scheduleId ?? null,
                ...(excludePeriodId && { id: { not: excludePeriodId } }),
            },
        });

        // Convert time strings to minutes for comparison
        const parseTime = (time: string): number => {
            const [hours, minutes] = time.split(':').map(Number);
            return hours * 60 + minutes;
        };

        const newStart = parseTime(startTime);
        const newEnd = parseTime(endTime);

        if (newStart >= newEnd) {
            throw new BadRequestException('End time must be after start time');
        }

        // Check for overlaps
        for (const period of existingPeriods) {
            const existingStart = parseTime(period.startTime);
            const existingEnd = parseTime(period.endTime);

            // Overlap condition: (newStart < existingEnd) AND (newEnd > existingStart)
            if (newStart < existingEnd && newEnd > existingStart) {
                throw new ConflictException(
                    `Time overlap detected with period "${period.name}" (${period.startTime} - ${period.endTime})`
                );
            }
        }
    }

    async getAnalyticsData(schoolId: number, academicYearId: number) {
        // Fetch all data in parallel
        const [entries, periods, teachers, subjects, classes, sections, rooms] = await Promise.all([
            // All timetable entries
            this.prisma.timetableEntry.findMany({
                where: { schoolId, academicYearId },
                include: {
                    subject: true,
                    teacher: {
                        select: {
                            id: true,
                            empCode: true,
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                    authIdentities: {
                                        where: { type: 'EMAIL' },
                                        select: { value: true }
                                    },
                                    // Fetch department via user membership
                                    departmentMemberships: {
                                        select: {
                                            department: { select: { name: true } }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    class: { select: { id: true, name: true, stage: true, scheduleId: true } },
                    section: { select: { id: true, name: true } },
                    period: true,
                    room: true,
                },
                orderBy: [{ day: 'asc' }, { period: { startTime: 'asc' } }],
            }),
            // Periods
            this.prisma.timePeriod.findMany({
                where: { schoolId, academicYearId },
                orderBy: { startTime: 'asc' },
            }),
            // Teachers
            this.prisma.teacherProfile.findMany({
                where: { schoolId },
                select: {
                    id: true,
                    empCode: true,
                    joinDate: true,
                    isActive: true,
                    personalInfo: {
                        select: {
                            fullName: true,
                            phone: true,
                        }
                    },
                    preferredSubjects: {
                        include: { subject: true }
                    },
                    user: {
                        select: {
                            id: true,
                            name: true,
                            authIdentities: {
                                where: { type: 'EMAIL' },
                                select: { value: true, type: true }
                            },
                            departmentMemberships: {
                                select: { department: { select: { name: true } } }
                            }
                        }
                    },
                    _count: {
                        select: {
                            timetableEntries: {
                                where: { academicYearId }
                            }
                        }
                    }
                }
            }),
            // Subjects
            this.prisma.subject.findMany({
                where: { schoolId, academicYearId },
                select: {
                    id: true,
                    name: true,
                    code: true,
                    _count: {
                        select: {
                            timetableEntries: true // camelCase
                        }
                    }
                }
            }),
            // Classes
            this.prisma.class.findMany({
                where: { schoolId },
                select: {
                    id: true,
                    name: true,
                    stage: true,
                    scheduleId: true,
                    schedule: { select: { id: true, name: true } }
                }
            }),
            // Sections
            this.prisma.section.findMany({
                where: { schoolId, academicYearId },
                select: {
                    id: true,
                    name: true,
                    classId: true,
                    _count: {
                        select: {
                            TimetableEntry: true // PascalCase in schema
                        }
                    }
                }
            }),
            // Rooms
            this.prisma.room.findMany({
                where: { schoolId },
                select: {
                    id: true,
                    name: true,
                    roomType: true, // Correct field name
                    capacity: true,
                    _count: {
                        select: {
                            timetableEntries: { // camelCase
                                where: { academicYearId }
                            }
                        }
                    }
                }
            })
        ]);

        // Calculate statistics
        const totalEntries = entries.length;
        const totalPeriods = periods.length;
        const teachingPeriods = periods.filter(p => p.type === 'TEACHING').length;
        const breakPeriods = periods.filter(p => p.type === 'BREAK').length;

        // Teacher workload
        const teacherWorkload = teachers.map((t: any) => ({
            id: t.id,
            name: t.user.name,
            empCode: t.empCode,
            status: t.isActive ? 'Active' : 'Inactive',
            joinDate: t.joinDate,
            // Extract department from first membership
            department: t.user.departmentMemberships?.[0]?.department?.name,
            // Extract personal info if available
            fullName: t.personalInfo?.fullName || t.user.name,
            email: t.user.authIdentities?.find((i: any) => i.type === 'EMAIL')?.value,
            phone: t.personalInfo?.phone,
            preferredSubjects: t.preferredSubjects?.map((ps: any) => ps.subject.name) || [],
            totalPeriods: t._count.timetableEntries,
            utilizationRate: teachingPeriods > 0
                ? ((t._count.timetableEntries / (teachingPeriods * 5)) * 100).toFixed(2)
                : '0.00'
        }));

        // Subject distribution
        const subjectDistribution = subjects.map((s: any) => ({
            id: s.id,
            name: s.name,
            code: s.code,
            totalPeriods: s._count.timetableEntries,
        }));

        // Room utilization
        const roomUtilization = rooms.map((r: any) => ({
            id: r.id,
            name: r.name,
            type: r.roomType,
            capacity: r.capacity,
            totalBookings: r._count.timetableEntries,
            utilizationRate: teachingPeriods > 0
                ? ((r._count.timetableEntries / (teachingPeriods * 5)) * 100).toFixed(2)
                : '0.00'
        }));

        // Section coverage
        const sectionCoverage = sections.map((s: any) => ({
            id: s.id,
            name: s.name,
            classId: s.classId,
            totalPeriods: s._count.TimetableEntry, // PascalCase
            coverageRate: teachingPeriods > 0
                ? ((s._count.TimetableEntry / (teachingPeriods * 5)) * 100).toFixed(2)
                : '0.00'
        }));

        // Day-wise distribution
        const dayWiseDistribution = {
            MONDAY: entries.filter(e => e.day === 'MONDAY').length,
            TUESDAY: entries.filter(e => e.day === 'TUESDAY').length,
            WEDNESDAY: entries.filter(e => e.day === 'WEDNESDAY').length,
            THURSDAY: entries.filter(e => e.day === 'THURSDAY').length,
            FRIDAY: entries.filter(e => e.day === 'FRIDAY').length,
            SATURDAY: entries.filter(e => e.day === 'SATURDAY').length,
        };

        return {
            summary: {
                totalEntries,
                totalPeriods,
                teachingPeriods,
                breakPeriods,
                totalTeachers: teachers.length,
                totalSubjects: subjects.length,
                totalClasses: classes.length,
                totalSections: sections.length,
                totalRooms: rooms.length,
                averagePeriodsPerTeacher: teachers.length > 0
                    ? (totalEntries / teachers.length).toFixed(2)
                    : '0.00',
            },
            entries, // All detailed timetable entries
            periods,
            teacherWorkload,
            subjectDistribution,
            roomUtilization,
            sectionCoverage,
            dayWiseDistribution,
            classes,
        };
    }

    // ----------------------------------------------------------------
    // HELPER: Year Lock
    // ----------------------------------------------------------------
    private async checkYearLock(schoolId: number, academicYearId: number) {
        const year = await this.prisma.academicYear.findFirst({
            where: { id: academicYearId, schoolId },
        });
        if (year && (year.status === 'CLOSED' || year.status === 'ARCHIVED')) {
            throw new BadRequestException('Cannot modify timetable for a closed or archived academic year.');
        }
    }
}
