import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SchoolSettingsService } from '../../principal/global/school-settings/school-settings.service';
import { SubmitAttendanceDto } from './dto/submit-attendance.dto';
import { AttendanceMode, AttendanceStatus, DayOfWeek } from '@prisma/client';

@Injectable()
export class TeacherAttendanceService {
    private readonly logger = new Logger(TeacherAttendanceService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly settingsService: SchoolSettingsService,
    ) { }

    async getActions(schoolId: number, userId: number, dateStr?: string) {
        // 1. Use the passed date string if available (ignores Time/UTC shift)
        // If dateStr is "2026-01-12", this creates a Date at UTC Midnight.
        const date = dateStr ? new Date(dateStr) : new Date();
        const settings = await this.settingsService.getSettings(schoolId);
        const mode = settings?.attendanceMode || AttendanceMode.DAILY;

        const teacherProfile = await this.prisma.teacherProfile.findUnique({ where: { userId } });
        if (!teacherProfile) {
            this.logger.warn(`getActions: User ${userId} is not a teacher`);
            return []; // Not a teacher, no actions
        }

        const dayOfWeek = this.getDayOfWeek(date);
        const actions: any[] = [];
        const access = settings?.dailyAttendanceAccess || 'CLASS_TEACHER';

        this.logger.log(`getActions: School=${schoolId}, User=${userId}, Date=${date.toISOString()}, Day=${dayOfWeek}, Mode=${mode}, Access=${access}`);

        if (mode === AttendanceMode.DAILY) {

            if (access === 'CLASS_TEACHER') {
                // 1. Check SectionTeacher (Direct assignment to a section)
                const sectionTeacherEntries = await this.prisma.sectionTeacher.findMany({
                    where: { teacherId: teacherProfile.id, schoolId },
                    include: {
                        section: { include: { class: true } }
                    }
                });
                this.logger.log(`getActions: Found ${sectionTeacherEntries.length} SectionTeacher entries`);

                for (const entry of sectionTeacherEntries) {
                    const exists = await this.checkSessionExists(schoolId, entry.section.classId, entry.section.id, null, null, date);
                    // Avoid duplicates if we process ClassHeadTeacher below (set usage or unique check)
                    // For simplicitly, we can check if action with this secId exists?
                    // Better: Push, and if ClassHeadTeacher covers same section, we skip or just map.

                    actions.push({
                        type: 'DAILY',
                        title: `Daily Attendance - ${entry.section.class.name} ${entry.section.name}`,
                        subtitle: 'Class Teacher (Section)',
                        classId: entry.section.classId,
                        sectionId: entry.sectionId,
                        isTaken: exists
                    });
                }

                // 2. Check ClassHeadTeacher (Assignment to entire class)
                // If a teacher is Head of Class 10, they should see ALL sections of Class 10
                // unless they are already assigned as SectionTeacher (handled above)
                const classHeadEntries = await this.prisma.classHeadTeacher.findMany({
                    where: { teacherId: teacherProfile.id, schoolId },
                    include: { class: { include: { sections: true } } }
                });
                this.logger.log(`getActions: Found ${classHeadEntries.length} ClassHeadTeacher entries`);

                for (const headEntry of classHeadEntries) {
                    if (headEntry.class && headEntry.class.sections) {
                        for (const section of headEntry.class.sections) {
                            // Deduplicate: Check if we already added this section via SectionTeacher
                            const alreadyAdded = actions.some(a => a.sectionId === section.id);
                            if (!alreadyAdded) {
                                const exists = await this.checkSessionExists(schoolId, section.classId, section.id, null, null, date);
                                actions.push({
                                    type: 'DAILY',
                                    title: `Daily Attendance - ${headEntry.class.name} ${section.name}`,
                                    subtitle: 'Class Teacher (Head)',
                                    classId: section.classId,
                                    sectionId: section.id,
                                    isTaken: exists
                                });
                            }
                        }
                    }
                }
            }

            if (access === 'FIRST_PERIOD_TEACHER') {
                // Find my first periods
                // We need to group by Section. For each section, am I the 1st period teacher?
                // This is complex to query efficiently. 
                // Easier: Find ALL my timetable entries for today.
                // For each, check if it is the first period for that section.

                const myEntries = await this.prisma.timetableEntry.findMany({
                    where: {
                        teacherId: teacherProfile.id,
                        day: dayOfWeek,
                        schoolId
                    },
                    include: { period: true, class: true, section: true, subject: true }
                });

                for (const entry of myEntries) {
                    // Is this the first period for this section?
                    const firstForSection = await this.prisma.timetableEntry.findFirst({
                        where: {
                            schoolId,
                            classId: entry.classId,
                            sectionId: entry.sectionId,
                            day: dayOfWeek
                        },
                        orderBy: { period: { startTime: 'asc' } },
                        include: { period: true }
                    });

                    if (firstForSection && firstForSection.id === entry.id) {
                        const exists = await this.checkSessionExists(schoolId, entry.classId, entry.sectionId, null, null, date);
                        actions.push({
                            type: 'DAILY',
                            title: `Daily Attendance - ${entry.class.name} ${entry.section.name}`,
                            subtitle: `First Period (${entry.subject.name})`,
                            classId: entry.classId,
                            sectionId: entry.sectionId,
                            isTaken: exists
                        });
                    }
                }
            }

        } else {
            // PERIOD_WISE
            const myEntries = await this.prisma.timetableEntry.findMany({
                where: {
                    teacherId: teacherProfile.id,
                    day: dayOfWeek,
                    schoolId
                },
                include: { period: true, class: true, section: true, subject: true },
                orderBy: { period: { startTime: 'asc' } }
            });

            for (const entry of myEntries) {
                const exists = await this.checkSessionExists(schoolId, entry.classId, entry.sectionId, entry.subjectId, entry.periodId, date);
                actions.push({
                    type: 'PERIOD_WISE',
                    title: `${entry.class.name} ${entry.section.name} - ${entry.subject.name}`,
                    subtitle: `${entry.period.name} (${entry.period.startTime} - ${entry.period.endTime})`,
                    classId: entry.classId,
                    sectionId: entry.sectionId,
                    subjectId: entry.subjectId,
                    periodId: entry.periodId,
                    isTaken: exists
                });
            }
        }

        return actions;
    }

    async getSession(
        schoolId: number,
        classId: number,
        sectionId: number,
        date: Date,
        subjectId?: number,
        periodId?: number,
    ) {
        // Normalize date (Midnight to Midnight)
        const startOfDay = new Date(date);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setUTCHours(23, 59, 59, 999);

        const where: any = {
            schoolId,
            classId,
            sectionId,
            date: {
                gte: startOfDay,
                lte: endOfDay
            }
        };
        // Strict Match logic
        if (subjectId) where.subjectId = subjectId;
        else where.subjectId = null;

        if (periodId) where.periodId = periodId;
        else where.periodId = null;

        return this.prisma.attendanceSession.findFirst({
            where,
            include: {
                attendances: {
                    include: { studentProfile: { include: { user: true } } }
                }
            }
        });
    }

    async submitAttendance(schoolId: number, userId: number, dto: SubmitAttendanceDto) {
        const academicYear = await this.prisma.academicYear.findFirst({ where: { schoolId, status: 'ACTIVE' } });
        if (!academicYear) throw new BadRequestException('No Active Academic Year');

        // Verify incoming IDs: Are they ProfileIDs or UserIDs?
        // Frontend likely sends whatever ID it has. If it sends UserID, we must resolve.
        // If it sends ProfileID, resolving by UserID won't work unless coincidentally same.
        // Best approach: Try to find StudentProfile where id IN ids OR userId IN ids.

        const incomingIds = dto.records.map(r => r.studentId);

        // Fetch profiles matching either ID or UserID
        const profiles = await this.prisma.studentProfile.findMany({
            where: {
                schoolId,
                OR: [
                    { id: { in: incomingIds } },
                    { userId: { in: incomingIds } }
                ]
            },
            select: { id: true, userId: true }
        });

        // Create a map to resolve incoming ID -> Profile ID
        const idMap = new Map<number, number>();
        profiles.forEach(p => {
            idMap.set(p.id, p.id);      // Map ProfileID -> ProfileID
            idMap.set(p.userId, p.id);  // Map UserID -> ProfileID
        });

        const resolvedRecords = dto.records.map(r => {
            const profileId = idMap.get(r.studentId);
            if (!profileId) {
                this.logger.warn(`Skipping attendance for unknown student ID/User ID: ${r.studentId}`);
                return null;
            }
            return {
                schoolId,
                // attendanceSessionId set later
                studentProfileId: profileId,
                status: r.status as AttendanceStatus,
                isLate: r.isLate || false,
                remarks: r.remarks
            };
        }).filter(r => r !== null);

        if (resolvedRecords.length === 0) {
            throw new BadRequestException('No valid student profiles found for submission');
        }

        return this.prisma.$transaction(async (tx) => {
            // Check if Session Exists (Date Range + strict subject/period)
            const date = new Date(dto.date);
            const startOfDay = new Date(date); startOfDay.setUTCHours(0, 0, 0, 0);
            const endOfDay = new Date(date); endOfDay.setUTCHours(23, 59, 59, 999);

            // Determine Subject/Period null or value
            const subjectId = dto.subjectId ?? null;
            const periodId = dto.periodId ?? null;

            let session = await tx.attendanceSession.findFirst({
                where: {
                    schoolId,
                    classId: dto.classId,
                    sectionId: dto.sectionId,
                    subjectId: subjectId,
                    periodId: periodId,
                    date: { gte: startOfDay, lte: endOfDay }
                }
            });

            if (session) {
                // UPDATE Existing Session
                session = await tx.attendanceSession.update({
                    where: { id: session.id },
                    data: {
                        markedById: userId,
                        takenAt: new Date(),
                    }
                });

                // Update Records: Upsert
                for (const rec of resolvedRecords) {
                    await tx.attendance.upsert({
                        where: {
                            schoolId_attendanceSessionId_studentProfileId: {
                                schoolId,
                                attendanceSessionId: session.id,
                                studentProfileId: rec.studentProfileId
                            }
                        },
                        create: {
                            schoolId,
                            attendanceSessionId: session.id,
                            studentProfileId: rec.studentProfileId,
                            status: rec.status,
                            isLate: rec.isLate,
                            remarks: rec.remarks
                        },
                        update: {
                            status: rec.status,
                            isLate: rec.isLate,
                            remarks: rec.remarks,
                        }
                    });
                }
            } else {
                // CREATE New Session
                session = await tx.attendanceSession.create({
                    data: {
                        schoolId,
                        academicYearId: academicYear.id,
                        classId: dto.classId,
                        sectionId: dto.sectionId,
                        subjectId: dto.subjectId ?? null,
                        periodId: dto.periodId ?? null,
                        date: new Date(dto.date),
                        markedById: userId
                    }
                });

                const recordsData = resolvedRecords.map(r => ({
                    ...r,
                    attendanceSessionId: session!.id
                }));

                if (recordsData.length > 0) {
                    await tx.attendance.createMany({
                        data: recordsData
                    });
                }
            }

            return session;
        });
    }

    private async checkSessionExists(schoolId: number, classId: number, sectionId: number, subjectId: number | null, periodId: number | null, date: Date): Promise<boolean> {
        // Normalize date for query (Strip time components)
        const startOfDay = new Date(date);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setUTCHours(23, 59, 59, 999);

        const where: any = {
            schoolId,
            classId,
            sectionId,
            date: {
                gte: startOfDay,
                lte: endOfDay
            }
        };
        // Strict Match logic
        if (subjectId !== undefined) where.subjectId = subjectId;
        if (periodId !== undefined) where.periodId = periodId;

        const count = await this.prisma.attendanceSession.count({ where: { ...where, subjectId, periodId } });

        this.logger.log(`checkSessionExists: Class=${classId} Sec=${sectionId} Sub=${subjectId} Per=${periodId} Date=${startOfDay.toISOString()} Count=${count}`);

        return count > 0;
    }

    async getSelfAttendance(schoolId: number, userId: number, month: number, year: number) {
        const teacherProfile = await this.prisma.teacherProfile.findUnique({
            where: { userId },
            select: { id: true }
        });

        if (!teacherProfile) {
            return [];
        }

        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);
        endDate.setUTCHours(23, 59, 59, 999);

        return this.prisma.staffAttendance.findMany({
            where: {
                schoolId,
                teacherId: teacherProfile.id,
                date: {
                    gte: startDate,
                    lte: endDate
                }
            },
            select: {
                date: true,
                status: true,
                checkInTime: true,
                checkOutTime: true,
                isLate: true
            },
            orderBy: { date: 'asc' }
        });
    }

    async getWeeklyClassAttendance(schoolId: number, classId: number, sectionId: number) {
        const result: { date: string, percentage: number }[] = [];
        const today = new Date();

        // Loop for last 7 days including today
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);

            // Skip Sunday
            if (d.getDay() === 0) continue;

            const startOfDay = new Date(d); startOfDay.setUTCHours(0, 0, 0, 0);
            const endOfDay = new Date(d); endOfDay.setUTCHours(23, 59, 59, 999);

            // Get session for this day
            // Only consider DAILY attendance or just take the first session found if multiple?
            // Usually for stats, we care about overall presence. 
            // If PERIOD_WISE, it's harder. Let's assume DAILY or take average of periods?
            // For MVP, lets try to find a session that represents "Daily" attendance or generally any session.
            const sessions = await this.prisma.attendanceSession.findMany({
                where: {
                    schoolId,
                    classId,
                    sectionId,
                    date: { gte: startOfDay, lte: endOfDay }
                },
                include: {
                    attendances: {
                        select: { status: true }
                    }
                }
            });

            if (sessions.length > 0) {
                // Aggregate all sessions (if multiple periods, this might handle it roughly)
                // Better strategy: Unique students present at least once? 
                // Or just average of session percentages?
                // Let's go with: Average percentage of all sessions found for that day.

                let totalPercentage = 0;

                sessions.forEach(session => {
                    const total = session.attendances.length;
                    if (total > 0) {
                        const present = session.attendances.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length;
                        totalPercentage += (present / total) * 100;
                    }
                });

                const avgPercentage = Math.round(totalPercentage / sessions.length);

                result.push({
                    date: d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
                    percentage: avgPercentage
                });
            } else {
                // No session explicitly recorded? 
                // Maybe show 0? Or maybe skip?
                // If it's a working day but no attendance taken, it effectively is 0 data.
                // But for chart continuity, 0 might look wrong if it was just a holiday.
                // Let's assume if no session, we skip it (unless we want to enforce showing data failure).
                // Let's push 0 for now to indicate "No Data/Attendance Not Taken"
                result.push({
                    date: d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
                    percentage: 0
                });
            }
        }

        return result;
    }

    private getDayOfWeek(date: Date): DayOfWeek {
        const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
        return days[date.getDay()] as DayOfWeek;
    }
}
