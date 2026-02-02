import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSubstitutionDto } from './dto/create-substitution.dto';
import { UpdateSubstitutionDto } from './dto/update-substitution.dto';
import { TimetableOverrideType, DayOfWeek, AttendanceStatus, LeaveStatus } from '@prisma/client';

@Injectable()
export class SubstitutionService {
    private readonly logger = new Logger(SubstitutionService.name);
    constructor(private prisma: PrismaService) { }

    // Helper to treat string YYYY-MM-DD as UTC start/end
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
        const d = new Date(date);
        // Ensure we check the day of the UTC date provided, not local system time
        const dayIndex = d.getUTCDay();
        const days: DayOfWeek[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
        return days[dayIndex];
    }

    async getAbsentTeachers(schoolId: number, academicYearId: number, dateString: string) {
        const date = new Date(dateString);
        const dayStart = this.startOfDay(date);
        const dayEnd = this.endOfDay(date);

        // 1. Find teachers with approved leave
        const approvedLeaves = await this.prisma.leaveRequest.findMany({
            where: {
                schoolId,
                academicYearId,
                status: LeaveStatus.APPROVED,
                startDate: { lte: date },
                endDate: { gte: date },
                leaveType: { category: 'TEACHER' },
            },
            include: {
                applicant: {
                    include: {
                        teacherProfile: true,
                    },
                },
                leaveType: true,
            },
        });

        const leaveTeacherIds = approvedLeaves.map((l) => l.applicant.teacherProfile?.id).filter(Boolean) as number[];

        // 2. Find teachers marked absent in StaffAttendance
        // Use range to be safe against time components
        const absentAttendance = await this.prisma.staffAttendance.findMany({
            where: {
                schoolId,
                academicYearId,
                date: {
                    gte: dayStart,
                    lte: dayEnd
                },
                status: {
                    in: [AttendanceStatus.ABSENT, AttendanceStatus.EXCUSED, AttendanceStatus.SUSPENDED],
                },
            },
            include: {
                teacher: {
                    include: {
                        user: true,
                    },
                },
            },
        });

        const absentAttendanceIds = absentAttendance.map((a) => a.teacherId);

        // Combine unique IDs
        const uniqueAbsentIds = [...new Set([...leaveTeacherIds, ...absentAttendanceIds])];

        const absentTeachers = await this.prisma.teacherProfile.findMany({
            where: {
                id: { in: uniqueAbsentIds },
            },
            include: {
                user: true,
            },
        });

        return absentTeachers.map(teacher => {
            const leave = approvedLeaves.find(l => l.applicant.teacherProfile?.id === teacher.id);
            const attendance = absentAttendance.find(a => a.teacherId === teacher.id);

            return {
                teacherId: teacher.id,
                name: `${teacher.user.name}`,
                reason: leave ? `Leave: ${leave.leaveType.name}` : (attendance ? `Attendance: ${attendance.status}` : 'Unknown'),
                isLeave: !!leave,
                isAttendance: !!attendance
            }
        });
    }

    async getImpactedClasses(schoolId: number, academicYearId: number, dateString: string) {
        const date = new Date(dateString);
        const dayOfWeek = this.getDayOfWeek(date);

        const absentTeachers = await this.getAbsentTeachers(schoolId, academicYearId, dateString);
        const absentTeacherIds = absentTeachers.map(t => t.teacherId);
        this.logger.log(`Found ${absentTeacherIds.length} absent teachers for date ${dateString}`);
        this.logger.log(`[DEBUG] Absent Teacher IDs: ${absentTeacherIds.join(', ')}`);

        if (absentTeacherIds.length === 0) {
            return [];
        }

        // DEBUG: Check count without status filter to see if entries exist at all
        const allEntriesCount = await this.prisma.timetableEntry.count({
            where: {
                schoolId,
                academicYearId,
                teacherId: { in: absentTeacherIds },
                day: dayOfWeek,
            }
        });
        this.logger.log(`[DEBUG] Total timetable entries (ignoring status) for these teachers on ${dayOfWeek}: ${allEntriesCount}`);

        // Find timetable entries for these teachers on this day
        const entries = await this.prisma.timetableEntry.findMany({
            where: {
                schoolId,
                academicYearId,
                teacherId: { in: absentTeacherIds },
                day: dayOfWeek,
                status: 'PUBLISHED',
            },
            include: {
                period: true,
                class: true,
                section: true,
                subject: true,
                teacher: {
                    include: { user: true }
                },
                timetableOverrides: {
                    where: {
                        date: date
                    },
                    include: {
                        substituteTeacher: {
                            include: { user: true }
                        }
                    }
                }
            },
            orderBy: {
                period: {
                    startTime: 'asc',
                },
            },
        });

        this.logger.log(`Found ${entries.length} timetable entries for absent teachers on ${dayOfWeek}`);


        // ---------------------------------------------------------
        // BULK FETCH OPTIMIZATION (Prevent N+1)
        // ---------------------------------------------------------
        // 1. Get all relevant period IDs
        const periodIds = [...new Set(entries.map(e => e.periodId))];

        // 2. Fetch all Regular Busy teachers in these periods
        const busyRegularRaw = await this.prisma.timetableEntry.findMany({
            where: {
                schoolId,
                academicYearId,
                day: dayOfWeek,
                periodId: { in: periodIds }
            },
            select: { teacherId: true, periodId: true }
        });

        // 3. Fetch all Substitution Busy teachers in these periods
        const busySubsRaw = await this.prisma.timetableOverride.findMany({
            where: {
                schoolId,
                date: date,
                entry: { periodId: { in: periodIds } },
                substituteTeacherId: { not: null }
            },
            select: { substituteTeacherId: true, entry: { select: { periodId: true } } }
        });

        // 4. Fetch All Active Teachers
        // We'll filter them in memory
        const allTeachers = await this.prisma.teacherProfile.findMany({
            where: {
                schoolId,
                isActive: true,
                user: { role: { name: 'TEACHER' } }
            },
            include: {
                user: true,
                preferredSubjects: true
            }
        });

        // 5. Build Lookups
        // Map: PeriodID -> Set<TeacherID>
        const busyMap = new Map<number, Set<number>>();

        busyRegularRaw.forEach(item => {
            if (!busyMap.has(item.periodId)) busyMap.set(item.periodId, new Set());
            busyMap.get(item.periodId)?.add(item.teacherId);
        });

        busySubsRaw.forEach(item => {
            const pid = item.entry.periodId;
            if (item.substituteTeacherId) {
                if (!busyMap.has(pid)) busyMap.set(pid, new Set());
                busyMap.get(pid)?.add(item.substituteTeacherId);
            }
        });

        // Enrich entries with suggestions computed in-memory
        const enrichedEntries = entries.map((entry) => {
            const override = entry.timetableOverrides[0];
            let suggestions: any[] = [];

            // Only fetch suggestions if not covered
            if (!override) {
                const busyInThisPeriod = busyMap.get(entry.periodId) || new Set();

                // Exclude: Absent Teachers + Busy Teachers + Already Subbing Teachers (which are in busyMap)
                // Note: absentTeacherIds is globally absent for the day.

                const candidates = allTeachers.filter(t => {
                    if (absentTeacherIds.includes(t.id)) return false; // Absent today
                    if (busyInThisPeriod.has(t.id)) return false; // Busy in this period
                    return true;
                });

                // Rank them
                const ranked = candidates.sort((a, b) => {
                    const aMatches = a.preferredSubjects.some(ps => ps.subjectId === entry.subjectId);
                    const bMatches = b.preferredSubjects.some(ps => ps.subjectId === entry.subjectId);
                    if (aMatches && !bMatches) return -1;
                    if (!aMatches && bMatches) return 1;
                    return 0; // Could sort alphabetically here
                });

                suggestions = ranked.slice(0, 3).map(t => ({
                    id: t.id,
                    name: t.user.name,
                    isSubjectMatch: t.preferredSubjects.some(ps => ps.subjectId === entry.subjectId)
                }));
            }

            return {
                entryId: entry.id,
                period: entry.period.name,
                startTime: entry.period.startTime,
                endTime: entry.period.endTime,
                className: `${entry.class.name} - ${entry.section.name}`,
                subject: entry.subject.name,
                originalTeacher: `${entry.teacher.user.name}`,
                originalTeacherId: entry.teacherId,
                isCovered: !!override,
                isCancelled: override?.type === TimetableOverrideType.CANCELLED,
                substitution: override ? {
                    id: override.id,
                    type: override.type,
                    substituteTeacher: override.substituteTeacher ? `${override.substituteTeacher.user.name}` : 'N/A',
                    substituteTeacherId: override.substituteTeacherId,
                    note: override.note
                } : null,
                suggestions // Top 3 recommended teachers
            };
        });

        return enrichedEntries;
    }

    async getAvailableTeachers(schoolId: number, academicYearId: number, dateString: string, periodId: number) {
        const date = new Date(dateString);
        const dayOfWeek = this.getDayOfWeek(date);

        // 1. Get absent teachers
        const absentTeachers = await this.getAbsentTeachers(schoolId, academicYearId, dateString);
        const absentTeacherIds = absentTeachers.map(t => t.teacherId);

        // 2. Get teachers who have a class in this period
        const busyTeachersInPeriod = await this.prisma.timetableEntry.findMany({
            where: {
                schoolId,
                academicYearId,
                day: dayOfWeek,
                periodId: periodId,
                status: 'PUBLISHED',
            },
            select: { id: true, teacherId: true }
        });

        // Check if any of these "busy" teachers are actually freed up by an override (Cancelled or Substituted)
        // If there is an override for their entry on this date, they are NOT teaching that class.
        // (Unless they are the substitute? No, this is the original teacher).
        const busyEntryIds = busyTeachersInPeriod.map(t => t.id);

        const freeingOverrides = await this.prisma.timetableOverride.findMany({
            where: {
                schoolId,
                date: date,
                entryId: { in: busyEntryIds }
            },
            select: { entryId: true }
        });

        const freedEntryIds = new Set(freeingOverrides.map(o => o.entryId));

        // Only teachers whose class is NOT overridden are effectively busy
        const busyTeacherIds = busyTeachersInPeriod
            .filter(t => !freedEntryIds.has(t.id))
            .map(t => t.teacherId);


        // 3. Get teachers who are already substituting in this period
        const substitutingTeachers = await this.prisma.timetableOverride.findMany({
            where: {
                schoolId,
                academicYearId,
                date: date,
                entry: {
                    periodId: periodId
                },
                substituteTeacherId: { not: null }
            },
            select: { substituteTeacherId: true }
        });
        const substitutingTeacherIds = substitutingTeachers.map(t => t.substituteTeacherId).filter(Boolean) as number[];

        const unavailableIds = [...new Set([...absentTeacherIds, ...busyTeacherIds, ...substitutingTeacherIds])];

        // 4. Fetch all active teachers excluding unavailable ones, strictly with role 'TEACHER'
        const availableTeachers = await this.prisma.teacherProfile.findMany({
            where: {
                schoolId,
                isActive: true,
                id: { notIn: unavailableIds },
                user: {
                    role: {
                        name: 'TEACHER'
                    }
                }
            },
            include: {
                user: true,
                preferredSubjects: {
                    include: { subject: true }
                }
            }
        });

        return availableTeachers.map(t => ({
            id: t.id,
            name: `${t.user.name}`,
            subjects: t.preferredSubjects.map(ps => ps.subject.name).join(', ')
        }));
    }

    async createSubstitution(userId: number, schoolId: number, academicYearId: number, dto: CreateSubstitutionDto) {
        // 1. Fetch original entry to validate and get time details
        const entry = await this.prisma.timetableEntry.findUnique({
            where: { id: dto.entryId },
            include: { period: true }
        });

        if (!entry || entry.schoolId !== schoolId) {
            throw new NotFoundException('Timetable entry not found');
        }

        const date = new Date(dto.date);
        const dayOfWeek = this.getDayOfWeek(date);

        // 2. Check for existing substitution on this entry
        const existing = await this.prisma.timetableOverride.findFirst({
            where: {
                schoolId,
                entryId: dto.entryId,
                date: date
            }
        });

        if (existing) {
            throw new BadRequestException('Substitution already exists for this slot. Please delete or update it.');
        }

        const type = dto.type || TimetableOverrideType.SUBSTITUTE;

        // 3. Logic for SUBSTITUTE type
        if (type === TimetableOverrideType.SUBSTITUTE) {
            if (!dto.substituteTeacherId) {
                // Determine if we allow "Open" substitutions? 
                // For now, let's allow it but typically a substitute is assigned.
                // If the user INTENDS to assign, they send an ID. 
                // If they don't, it might be just marking it "To Be Substituted".
            }

            if (dto.substituteTeacherId) {
                // SECURITY CHECK: Ensure substitute teacher belongs to this school
                const subTeacher = await this.prisma.teacherProfile.findUnique({
                    where: { id: dto.substituteTeacherId }
                });

                if (!subTeacher || subTeacher.schoolId !== schoolId) {
                    throw new BadRequestException('Invalid substitute teacher selected.');
                }

                // A. Check if they have a regular class at this time
                const busyRegular = await this.prisma.timetableEntry.findFirst({
                    where: {
                        schoolId,
                        academicYearId,
                        teacherId: dto.substituteTeacherId,
                        day: dayOfWeek,
                        periodId: entry.periodId,
                    }
                });

                if (busyRegular) {
                    // Check if this busy slot is freed up by another override
                    const isFreedUp = await this.prisma.timetableOverride.findFirst({
                        where: {
                            schoolId,
                            entryId: busyRegular.id, // The class they normally teach
                            date: date
                        }
                    });

                    if (!isFreedUp) {
                        throw new BadRequestException('Substitute teacher has a regular class at this time.');
                    }

                    if (isFreedUp.type === TimetableOverrideType.SUBSTITUTE) {
                        throw new BadRequestException('Substitute teacher is marked absent/substituted at this time.');
                    }
                    // If CANCELLED, they are free.
                }

                // B. Check if they are already substituting elsewhere at this time
                const busySub = await this.prisma.timetableOverride.findFirst({
                    where: {
                        schoolId,
                        date: date,
                        substituteTeacherId: dto.substituteTeacherId,
                        entry: {
                            periodId: entry.periodId // Same period
                        }
                    }
                });

                if (busySub) {
                    throw new BadRequestException('Substitute teacher is already assigned to another substitution at this time.');
                }
            }
        } else if (type === TimetableOverrideType.CANCELLED) {
            // If cancelled, force substituteTeacher to null
            dto.substituteTeacherId = undefined;
            dto.substituteRoomId = undefined;
        }

        return this.prisma.timetableOverride.create({
            data: {
                schoolId,
                academicYearId,
                entryId: dto.entryId,
                date: date,
                type: type,
                substituteTeacherId: dto.substituteTeacherId,
                substituteRoomId: dto.substituteRoomId,
                note: dto.note,
                createdById: userId
            }
        });
    }

    async deleteSubstitution(schoolId: number, id: number) {
        const sub = await this.prisma.timetableOverride.findUnique({
            where: { id }
        });
        if (!sub || sub.schoolId !== schoolId) {
            throw new NotFoundException('Substitution not found');
        }

        return this.prisma.timetableOverride.delete({
            where: { id }
        });
    }

    async getSubstitutions(schoolId: number, academicYearId: number, dateString?: string) {
        const where: any = {
            schoolId,
            academicYearId
        };
        if (dateString) {
            where.date = new Date(dateString);
        }

        const overrides = await this.prisma.timetableOverride.findMany({
            where,
            include: {
                substituteTeacher: {
                    include: { user: true }
                },
                entry: {
                    include: {
                        class: true,
                        section: true,
                        subject: true,
                        period: true,
                        teacher: {
                            include: { user: true }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return overrides.map(o => ({
            id: o.id,
            date: o.date,
            originalTeacher: `${o.entry.teacher.user.name}`,
            substituteTeacher: o.substituteTeacher ? `${o.substituteTeacher.user.name}` : 'N/A',
            className: `${o.entry.class.name}-${o.entry.section.name}`,
            subject: o.entry.subject.name,
            period: `${o.entry.period.name} (${o.entry.period.startTime})`,
            note: o.note
        }));
    }
    async updateSubstitution(schoolId: number, id: number, dto: UpdateSubstitutionDto) {
        const existing = await this.prisma.timetableOverride.findUnique({
            where: { id },
            include: { entry: true }
        });

        if (!existing || existing.schoolId !== schoolId) {
            throw new NotFoundException('Substitution not found');
        }

        // If updating substitute Teacher, we must validate availability (similar to create)
        if (dto.substituteTeacherId && dto.substituteTeacherId !== existing.substituteTeacherId) {
            const date = existing.date;
            const dayOfWeek = this.getDayOfWeek(date);

            const subTeacher = await this.prisma.teacherProfile.findUnique({
                where: { id: dto.substituteTeacherId }
            });

            if (!subTeacher || subTeacher.schoolId !== schoolId) {
                throw new BadRequestException('Invalid substitute teacher selected.');
            }

            // A. Check Regular Class
            const busyRegular = await this.prisma.timetableEntry.findFirst({
                where: {
                    schoolId,
                    academicYearId: existing.academicYearId,
                    teacherId: dto.substituteTeacherId,
                    day: dayOfWeek,
                    periodId: existing.entry.periodId,
                }
            });

            if (busyRegular) {
                const isFreedUp = await this.prisma.timetableOverride.findFirst({
                    where: {
                        schoolId,
                        entryId: busyRegular.id, // The class they normally teach
                        date: date
                    }
                });
                // If not freed up, they are busy.
                if (!isFreedUp) {
                    throw new BadRequestException('Substitute teacher has a regular class at this time.');
                }
                // If freed up but by substitution? (Meaning they are absent/subbed out)
                if (isFreedUp.type === TimetableOverrideType.SUBSTITUTE) {
                    throw new BadRequestException('Substitute teacher is marked absent/substituted at this time.');
                }
            }

            // B. Check Other Subs
            const busySub = await this.prisma.timetableOverride.findFirst({
                where: {
                    schoolId,
                    date: date,
                    substituteTeacherId: dto.substituteTeacherId,
                    entry: { periodId: existing.entry.periodId },
                    id: { not: id } // Exclude self
                }
            });

            if (busySub) {
                throw new BadRequestException('Substitute teacher is already assigned to another substitution at this time.');
            }
        }

        return this.prisma.timetableOverride.update({
            where: { id },
            data: dto
        });
    }

    async getTeacherSubstitutionHistory(schoolId: number, teacherId: number, academicYearId: number, dateString?: string) {
        // 1. Teacher Info
        const teacher = await this.prisma.teacherProfile.findUnique({
            where: { id: teacherId },
            include: {
                user: true,
                preferredSubjects: { include: { subject: true } }
            }
        });
        if (!teacher || teacher.schoolId !== schoolId) throw new NotFoundException('Teacher not found');

        // 2. Fetch all substitutions done BY this teacher
        const substitutions = await this.prisma.timetableOverride.findMany({
            where: {
                schoolId,
                academicYearId,
                substituteTeacherId: teacherId
            },
            include: {
                entry: {
                    include: {
                        class: true,
                        section: true,
                        subject: true,
                        period: true,
                        teacher: { include: { user: true } } // The original teacher
                    }
                }
            },
            orderBy: { date: 'desc' }
        });

        // Use provided date or today
        const pivotDate = dateString ? new Date(dateString) : new Date();
        const startOfPivot = this.startOfDay(pivotDate);
        const endOfPivot = this.endOfDay(pivotDate);

        const past: any[] = [];
        const upcoming: any[] = [];
        const activeList: any[] = []; // "Today" or the selected date

        substitutions.forEach(sub => {
            const subDate = new Date(sub.date);
            const item = {
                id: sub.id,
                date: sub.date,
                period: `${sub.entry.period.name} (${sub.entry.period.startTime})`,
                className: `${sub.entry.class.name}-${sub.entry.section.name}`,
                subject: sub.entry.subject.name,
                originalTeacher: sub.entry.teacher.user.name,
                note: sub.note
            };

            if (subDate.getTime() < startOfPivot.getTime()) {
                past.push(item);
            } else if (subDate.getTime() > endOfPivot.getTime()) {
                upcoming.push(item);
            } else {
                activeList.push(item);
            }
        });

        // 3. Stats
        const stats = {
            totalSubstitutions: substitutions.length,
            subjectsCovered: [...new Set(substitutions.map(s => s.entry.subject.name))].join(', ')
        };

        return {
            teacher: {
                id: teacher.id,
                name: teacher.user.name,
                subjects: teacher.preferredSubjects.map(ps => ps.subject.name).join(', ')
            },
            stats,
            active: activeList, // Renamed from 'today' to 'active' to reflect date selection
            upcoming,
            past
        };
    }
}
