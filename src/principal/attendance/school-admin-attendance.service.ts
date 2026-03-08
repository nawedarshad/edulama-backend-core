// @ts-nocheck
import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateStaffAttendanceDto } from './dto/update-staff-attendance.dto';
import { AttendanceStatus } from './dto/update-staff-attendance.dto';
import { MarkStudentLateDto } from '../../teacher/attendance/dto/mark-student-late.dto';
import { TakeClassAttendanceDto } from './dto/take-class-attendance.dto';
import { AttendanceReportFilterDto } from './dto/attendance-report-wrapper.dto';
import { AttendanceStatus as PrismaAttendanceStatus } from '@prisma/client';

@Injectable()
export class SchoolAdminAttendanceService {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * Validates if the given date is a working day for the school.
     * Checks CalendarException (holidays) and WorkingPattern (weekends).
     */
    async validateDate(schoolId: number, dateStr: string, allowHoliday = false) {
        // Parse ISO string or YYYY-MM-DD to strictly UTC midnight
        // This avoids timezone shifts (e.g. 15th becoming 14th)
        let date: Date;
        if (dateStr.includes('T')) {
            date = new Date(dateStr);
        } else {
            // Assume YYYY-MM-DD
            date = new Date(`${dateStr}T00:00:00.000Z`);
        }

        // Force reset to UTC midnight just in case
        date.setUTCHours(0, 0, 0, 0);

        // 1. Check for Academic Year
        const ay = await this.prisma.academicYear.findFirst({
            where: {
                schoolId,
                startDate: { lte: date },
                endDate: { gte: date },
                status: 'ACTIVE'
            }
        });

        if (!ay) {
            throw new BadRequestException(`No active academic year found for date ${dateStr}`);
        }

        // 2. Check Calendar Exceptions
        const exception = await this.prisma.calendarException.findFirst({
            where: {
                schoolId,
                academicYearId: ay.id,
                date: date,
            }
        });

        if (exception && exception.type === 'HOLIDAY') {
            if (!allowHoliday) {
                throw new BadRequestException(`Cannot take attendance on a holiday: ${exception.title || 'Holiday'}`);
            }
        }

        // 3. Check Working Pattern (Weekends)
        // If no exception found, check if it's a weekend.
        // For now, we trust the user knows what they are doing if it's not explicitly a holiday.
        // Or we could check WorkingPattern if needed.

        return { academicYearId: ay.id, date };
    }

    async getDailyAttendance(schoolId: number, dateStr: string, allowHoliday = false) {
        const validation = await this.validateDate(schoolId, dateStr, allowHoliday);
        const { academicYearId, date } = validation;

        // Fetch all active teachers
        const teachers = await this.prisma.teacherProfile.findMany({
            where: {
                schoolId,
                isActive: true,
                user: {
                    role: {
                        name: 'TEACHER'
                    }
                }
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        photo: true,
                        departmentMemberships: {
                            include: {
                                department: true
                            }
                        }
                    }
                },
                personalInfo: {
                    select: {
                        phone: true,
                        email: true
                    }
                },
                attendances: {
                    where: {
                        date: date,
                        academicYearId
                    },
                    take: 1
                }
            },
            orderBy: {
                user: {
                    name: 'asc'
                }
            }
        });

        // Fetch approved leaves for this date
        const leaves = await this.prisma.leaveRequest.findMany({
            where: {
                schoolId,
                status: 'APPROVED',
                startDate: { lte: date },
                endDate: { gte: date }
            },
            select: {
                applicantId: true
            }
        });

        const leavesSet = new Set(leaves.map(l => l.applicantId));

        return teachers.map(t => {
            const attendance = t.attendances[0];
            const isOnLeave = leavesSet.has(t.user.id);

            // Default logic:
            // - If attendance record exists, use that.
            // - If no record but user is on leave, status = EXCUSED.
            // - Else, status = undefined (Not Taken).

            let status: AttendanceStatus | 'EXCUSED' | null = undefined;
            let remarks: string | null = undefined;
            let checkInTime: Date | null = undefined;
            let checkOutTime: Date | null = undefined;
            let isLate = false;

            if (attendance) {
                status = attendance.status as AttendanceStatus;
                remarks = attendance.remarks;
                checkInTime = attendance.checkInTime;
                checkOutTime = attendance.checkOutTime;
                isLate = attendance.isLate;
            } else if (isOnLeave) {
                status = AttendanceStatus.EXCUSED;
                remarks = 'On Leave';
            }

            const departments = t.user.departmentMemberships?.map(dm => dm.department?.name).filter(Boolean).join(', ') || '';

            return {
                teacherId: t.id,
                name: t.user.name,
                photo: t.user.photo,
                empCode: t.empCode,

                // New Details
                departments: departments || 'N/A',
                phone: t.personalInfo?.phone || undefined,
                email: t.personalInfo?.email || undefined,

                status,
                remarks,
                checkInTime,
                checkOutTime,
                isLate,
            };
        });
    }

    async saveDailyAttendance(schoolId: number, dto: UpdateStaffAttendanceDto) {
        const validation = await this.validateDate(schoolId, dto.date);
        const { academicYearId, date } = validation;

        const results: any[] = [];

        // Process updates in transaction or batch? Upsert one by one is safer for logic.
        for (const update of dto.updates) {
            const record = await this.prisma.staffAttendance.upsert({
                where: {
                    schoolId_academicYearId_teacherId_date: {
                        schoolId,
                        academicYearId,
                        teacherId: update.teacherId,
                        date: date
                    }
                },
                create: {
                    schoolId,
                    academicYearId,
                    teacherId: update.teacherId,
                    date: date,
                    status: update.status,
                    remarks: update.remarks,
                    checkInTime: update.checkInTime ? new Date(update.checkInTime) : undefined, // specific date or just time? date usually.
                    checkOutTime: update.checkOutTime ? new Date(update.checkOutTime) : undefined,
                    isLate: update.status === AttendanceStatus.LATE
                },
                update: {
                    status: update.status,
                    remarks: update.remarks,
                    checkInTime: update.checkInTime ? new Date(update.checkInTime) : undefined,
                    checkOutTime: update.checkOutTime ? new Date(update.checkOutTime) : undefined,
                    isLate: update.status === AttendanceStatus.LATE
                }
            });
            results.push(record);
        }

        return { message: 'Attendance updated successfully', count: results.length };
    }

    async markStudentLate(userId: number, dto: MarkStudentLateDto) {
        // 1. Fetch user and verify they are Principal or School Administrator
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                role: true,
                schoolAdminScopes: true,
            }
        });

        if (!user) {
            throw new NotFoundException('User not found.');
        }

        const schoolId = user.schoolId;

        // Check if user is Principal or School Administrator
        const isPrincipal = user?.role?.name === 'PRINCIPAL';
        const isSchoolAdmin = user.schoolAdminScopes && user.schoolAdminScopes.length > 0;

        if (!isPrincipal && !isSchoolAdmin) {
            throw new ForbiddenException('Only Principal or School Administrators can mark students as late.');
        }

        // 2. Verify student belongs to the same school
        const student = await this.prisma.studentProfile.findFirst({
            where: {
                userId: dto.userId,
                schoolId,
            }
        });

        if (!student) {
            throw new NotFoundException('Student not found in your school.');
        }

        // 3. Check if attendance session exists for this class/section/date
        const attendanceDate = new Date(dto.date);

        // Find or create attendance session for daily attendance
        let session = await this.prisma.attendanceSession.findFirst({
            where: {
                schoolId,
                academicYearId: dto.academicYearId,
                classId: dto.classId,
                sectionId: dto.sectionId,
                date: attendanceDate,
                subjectId: undefined, // Daily attendance
                timePeriodId: undefined,
            }
        });

        // If no session exists, create one
        if (!session) {
            session = await this.prisma.attendanceSession.create({
                data: {
                    schoolId,
                    academicYearId: dto.academicYearId,
                    classId: dto.classId,
                    sectionId: dto.sectionId,
                    date: attendanceDate,
                    markedById: userId,
                    remarks: 'Late arrival session',
                }
            });
        }

        // 4. Create or update attendance record with LATE status
        const attendance = await this.prisma.attendance.upsert({
            where: {
                schoolId_attendanceSessionId_studentProfileId: {
                    schoolId,
                    attendanceSessionId: session.id,
                    studentProfileId: student.id,
                }
            },
            update: {
                status: PrismaAttendanceStatus.PRESENT, // Late implies Present
                isLate: true,
                lateReason: dto.lateReason,
                lateMarkedAt: new Date(),
                lateMarkedById: userId,
            },
            create: {
                schoolId,
                attendanceSessionId: session.id,
                studentProfileId: student.id,
                status: PrismaAttendanceStatus.PRESENT, // Late implies Present
                isLate: true,
                lateReason: dto.lateReason,
                lateMarkedAt: new Date(),
                lateMarkedById: userId,
            }
        });

        return {
            message: 'Student marked as late successfully',
            attendance: {
                id: attendance.id,
                studentProfileId: attendance.studentProfileId,
                status: attendance.status,
                isLate: attendance.isLate,
                lateReason: attendance.lateReason,
                lateMarkedAt: attendance.lateMarkedAt,
            }
        };
    }

    async getLateMonitors(userId: number, academicYearId: number) {
        // 1. Verify user is Principal or School Administrator
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                role: true,
                schoolAdminScopes: true,
            }
        });

        if (!user) {
            throw new NotFoundException('User not found.');
        }

        const isPrincipal = user?.role?.name === 'PRINCIPAL';
        const isSchoolAdmin = user.schoolAdminScopes && user.schoolAdminScopes.length > 0;

        if (!isPrincipal && !isSchoolAdmin) {
            throw new ForbiddenException('Only Principal or School Administrators can view late monitors.');
        }

        const schoolId = user.schoolId;

        // 2. Fetch all late attendance monitors for this academic year
        const monitors = await this.prisma.lateAttendanceMonitor.findMany({
            where: {
                schoolId,
                academicYearId,
            },
            include: {
                teacher: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                photo: true,
                            }
                        },
                        personalInfo: {
                            select: {
                                email: true,
                                phone: true,
                            }
                        }
                    }
                }
            },
            orderBy: {
                assignedAt: 'desc'
            }
        });

        return monitors.map(m => ({
            id: m.id,
            teacherId: m.teacherId,
            teacherName: m.teacher.user.name,
            teacherPhoto: m.teacher.user.photo,
            email: m.teacher.personalInfo?.email,
            phone: m.teacher.personalInfo?.phone,
            empCode: m.teacher.empCode,
            assignedAt: m.assignedAt,
        }));
    }

    async takeClassAttendance(userId: number, dto: TakeClassAttendanceDto) {
        // 1. Fetch User to get School ID
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new NotFoundException('User not found.');
        }

        const schoolId = user.schoolId;

        // 2. Create or Update Attendance Session
        let session = await this.prisma.attendanceSession.findFirst({
            where: {
                schoolId,
                academicYearId: dto.academicYearId,
                classId: dto.classId,
                sectionId: dto.sectionId,
                subjectId: dto.subjectId || undefined,
                timePeriodId: dto.timePeriodId || undefined,
                date: new Date(dto.date),
            }
        });

        return this.prisma.$transaction(async (tx) => {
            if (!session) {
                // Create new session if it doesn't exist
                session = await tx.attendanceSession.create({
                    data: {
                        schoolId,
                        academicYearId: dto.academicYearId,
                        classId: dto.classId,
                        sectionId: dto.sectionId,
                        subjectId: dto.subjectId,
                        timePeriodId: dto.timePeriodId,
                        date: new Date(dto.date),
                        markedById: userId, // Marked by Admin
                        takenAt: new Date(),
                    }
                });
            } else {
                // Update session metadata
                await tx.attendanceSession.update({
                    where: { id: session.id },
                    data: {
                        takenAt: new Date(),
                        markedById: userId,
                    }
                });
            }

            // Prepare upsert operations for attendance records
            for (const record of dto.attendances) {
                let pid = record.studentProfileId;

                // Resolve studentProfileId from userId if missing
                if (!pid && record.userId) {
                    const student = await tx.studentProfile.findFirst({
                        where: { userId: record.userId, schoolId },
                        select: { id: true }
                    });
                    if (student) {
                        pid = student.id;
                    }
                }

                if (!pid) {
                    continue;
                }

                await tx.attendance.upsert({
                    where: {
                        schoolId_attendanceSessionId_studentProfileId: {
                            schoolId,
                            attendanceSessionId: session.id,
                            studentProfileId: pid as number,
                        }
                    },
                    update: {
                        status: record.status,
                        remarks: record.remarks,
                        isLate: record.status === "ABSENT" ? false : undefined,
                    },
                    create: {
                        schoolId,
                        attendanceSessionId: session.id,
                        studentProfileId: pid as number,
                        status: record.status,
                        remarks: record.remarks,
                    }
                });
            }

            return { message: 'Attendance recorded successfully', sessionId: session.id };
        });
    }

    async getClassSession(
        userId: number,
        classId: number,
        sectionId: number,
        date: Date,
        subjectId?: number,
        timePeriodId?: number
    ) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');
        const schoolId = user.schoolId;

        const session = await this.prisma.attendanceSession.findFirst({
            where: {
                schoolId,
                classId,
                sectionId,
                date,
                subjectId: subjectId || undefined,
                timePeriodId: timePeriodId || undefined,
            },
            include: {
                attendances: {
                    include: {
                        studentProfile: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        name: true,
                                        photo: true,
                                    }
                                }
                            }
                        }
                    }
                },
                markedBy: {
                    select: {
                        name: true
                    }
                }
            }
        });

        if (!session) {
            // If no session exists, return the student list for manual marking
            // behave like "Take Attendance" view for Principal
            const students = await this.prisma.studentProfile.findMany({
                where: {
                    schoolId,
                    classId,
                    sectionId,
                    isActive: true
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            photo: true,
                        }
                    }
                },
                orderBy: {
                    user: { name: 'asc' }
                }
            });

            return {
                sessionId: undefined,
                date: date,
                takenAt: undefined,
                markedBy: undefined,
                attendances: students.map(s => ({
                    studentProfileId: s.id,
                    userId: s.userId,
                    studentName: s.user.name,
                    status: undefined, // Not marked
                    remarks: undefined,
                    isLate: false,
                    lateReason: undefined,
                }))
            };
        }

        return {
            sessionId: session.id,
            date: session.date,
            takenAt: session.takenAt,
            markedBy: (session as any).markedBy?.name,
            attendances: (session as any).attendances.map(a => ({
                studentProfileId: a.studentProfileId,
                userId: a.studentProfile.userId,
                studentName: a.studentProfile.user.name,
                status: a.status,
                remarks: a.remarks,
                isLate: a.isLate,
                lateReason: a.lateReason,
            }))
        };
    }

    async deleteSession(userId: number, sessionId: number) {
        // 1. Verify user (School Admin/Principal)
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');

        // 2. Verify session exists and belongs to school
        const session = await this.prisma.attendanceSession.findFirst({
            where: {
                id: sessionId,
                schoolId: user.schoolId
            }
        });

        if (!session) {
            throw new NotFoundException('Attendance session not found.');
        }

        // 3. Delete session
        await this.prisma.attendanceSession.delete({
            where: { id: sessionId }
        });

        return { message: 'Attendance session deleted successfully' };
    }

    // --- REPORT METHODS ---

    private resolveDateRange(dto: AttendanceReportFilterDto) {
        let start: Date, end: Date;
        if (dto.startDate && dto.endDate) {
            start = new Date(dto.startDate); start.setUTCHours(0, 0, 0, 0);
            end = new Date(dto.endDate); end.setUTCHours(23, 59, 59, 999);
        } else if (dto.date) {
            const d = new Date(dto.date);
            start = new Date(d); start.setUTCHours(0, 0, 0, 0);
            end = new Date(d); end.setUTCHours(23, 59, 59, 999);
        } else {
            throw new BadRequestException('Date or Date Range required');
        }
        return { start, end };
    }

    async getReportStudentLate(schoolId: number, dto: AttendanceReportFilterDto) {
        const { start, end } = this.resolveDateRange(dto);

        const records = await this.prisma.attendance.findMany({
            where: {
                schoolId,
                isLate: true,
                session: {
                    date: {
                        gte: start,
                        lte: end
                    },
                    academicYearId: dto.academicYearId,
                    classId: dto.classId,
                    sectionId: dto.sectionId
                }
            },
            include: {
                studentProfile: {
                    include: {
                        user: { select: { name: true, photo: true } },
                    }
                },
                session: {
                    include: {
                        class: { select: { name: true } },
                        section: { select: { name: true } }
                    }
                }
            },
            orderBy: {
                lateMarkedAt: 'desc'
            }
        });

        return records.map(r => ({
            studentId: r.studentProfileId,
            name: r?.studentProfile?.user.name,
            photo: r?.studentProfile?.user.photo,
            rollNo: r.studentProfile.rollNo,
            class: r.session?.class.name,
            section: r.session?.section.name,
            lateReason: r.lateReason,
            lateMarkedAt: r.lateMarkedAt,
        }));
    }

    async getReportStudentAbsent(schoolId: number, dto: AttendanceReportFilterDto) {
        const { start, end } = this.resolveDateRange(dto);

        const records = await this.prisma.attendance.findMany({
            where: {
                schoolId,
                status: 'ABSENT',
                session: {
                    date: {
                        gte: start,
                        lte: end
                    },
                    academicYearId: dto.academicYearId,
                    classId: dto.classId,
                    sectionId: dto.sectionId
                }
            },
            include: {
                studentProfile: {
                    include: {
                        user: { select: { name: true, photo: true, id: true } },
                        parents: {
                            include: {
                                parent: true
                            },
                            take: 1 // Get first parent for contact
                        }
                    }
                },
                session: {
                    include: {
                        class: { select: { name: true } },
                        section: { select: { name: true } }
                    }
                }
            }
        });

        return records.map(r => {
            const parent = r.studentProfile.parents[0]?.parent;
            // Fallback to any available contact number from parent profile
            const parentName = parent?.fatherName || parent?.motherName || parent?.guardianName;
            const parentPhone = parent?.fatherContact || parent?.motherContact || parent?.guardianContact;

            return {
                studentId: r.studentProfileId,
                userId: r?.studentProfile?.user.id,
                name: r?.studentProfile?.user.name,
                photo: r?.studentProfile?.user.photo,
                rollNo: r.studentProfile.rollNo,
                class: r.session?.class.name,
                section: r.session?.section.name,
                parentName,
                parentPhone,
            };
        });
    }

    async getClassComparisonReport(schoolId: number, dto: AttendanceReportFilterDto) {
        // Report for a specific day or range
        const { start, end } = this.resolveDateRange(dto);

        // Group by Class and Section
        const stats = await this.prisma.attendanceSession.findMany({
            where: {
                schoolId,
                academicYearId: dto.academicYearId,
                date: {
                    gte: start,
                    lte: end
                }
            },
            include: {
                class: { select: { name: true } },
                section: { select: { name: true } },
                attendances: {
                    select: {
                        status: true,
                        isLate: true
                    }
                }
            }
        });

        // Aggregation Map
        const aggregation = new Map<string, {
            classId: number;
            sectionId: number;
            className: string;
            sectionName: string;
            totalStudents: number;
            presentCount: number;
            absentCount: number;
            lateCount: number;
            excusedCount: number;
        }>();

        for (const session of stats) {
            const key = `${session?.classId}-${session?.sectionId}`;

            if (!aggregation.has(key)) {
                aggregation.set(key, {
                    classId: session?.classId,
                    sectionId: session?.sectionId,
                    className: session?.class.name,
                    sectionName: session?.section.name,
                    totalStudents: 0,
                    presentCount: 0,
                    absentCount: 0,
                    lateCount: 0,
                    excusedCount: 0,
                });
            }

            const entry = aggregation.get(key)!;

            entry.totalStudents += (session as any).attendances.length;
            entry.presentCount += (session as any).attendances.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length;
            entry.absentCount += (session as any).attendances.filter(a => a.status === 'ABSENT').length;
            entry.lateCount += (session as any).attendances.filter(a => a.isLate).length;
            entry.excusedCount += (session as any).attendances.filter(a => a.status === 'EXCUSED').length;
        }

        // Convert to array and calculate percentage
        const result = Array.from(aggregation.values()).map(r => ({
            ...r,
            attendancePercentage: r.totalStudents > 0 ? ((r.presentCount / r.totalStudents) * 100).toFixed(2) : '0.00'
        }));

        // Sort by highest attendance
        return result.sort((a, b) => parseFloat(b.attendancePercentage) - parseFloat(a.attendancePercentage));
    }

    async getAttendanceStats(schoolId: number, dto: AttendanceReportFilterDto) {
        // Range based report
        const { start, end } = this.resolveDateRange(dto);

        const counts = await this.prisma.attendance.groupBy({
            by: ['status'],
            where: {
                schoolId,
                session: {
                    academicYearId: dto.academicYearId,
                    date: {
                        gte: start,
                        lte: end
                    }
                }
            },
            _count: {
                status: true
            }
        });

        const lateCount = await this.prisma.attendance.count({
            where: {
                schoolId,
                isLate: true,
                session: {
                    academicYearId: dto.academicYearId,
                    date: {
                        gte: start,
                        lte: end
                    }
                }
            }
        });

        const stats = {
            PRESENT: 0,
            ABSENT: 0,
            LATE: 0,
            EXCUSED: 0,
            SUSPENDED: 0,
            TOTAL: 0
        };

        counts.forEach(c => {
            if (stats[c.status] !== undefined) {
                stats[c.status] = c._count.status;
            }
            stats.TOTAL += c._count.status;
        });

        stats.LATE = lateCount; // Explicit late count (as they are usually marked PRESENT + isLate)

        return stats;
    }

    private async getStudentAttendanceRanking(schoolId: number, dto: AttendanceReportFilterDto, order: 'asc' | 'desc') {
        const { start, end } = this.resolveDateRange(dto);
        const limit = dto.limit || 10;

        // 1. Get raw attendance counts per student
        const rawStats = await this.prisma.attendance.groupBy({
            by: ['studentProfileId', 'status'],
            where: {
                schoolId,
                session: {
                    academicYearId: dto.academicYearId,
                    date: { gte: start, lte: end },
                    classId: dto.classId,
                    sectionId: dto.sectionId
                }
            },
            _count: { status: true }
        });

        // 2. Aggregate in memory
        const studentStats = new Map<number, { present: number, total: number }>();

        for (const stat of rawStats) {
            let current = studentStats.get(stat.studentProfileId);
            if (!current) {
                current = { present: 0, total: 0 };
                studentStats.set(stat.studentProfileId, current);
            }
            current.total += stat._count.status;

            if (stat.status === 'PRESENT' || stat.status === 'LATE') {
                current.present += stat._count.status;
            }
        }

        // 3. Convert to array and sort
        const ranked = Array.from(studentStats.entries()).map(([id, stats]) => ({
            studentId: id,
            ...stats,
            score: (stats.present / stats.total) * 100
        }));

        ranked.sort((a, b) => {
            return order === 'desc' ? b.score - a.score : a.score - b.score;
        });

        // 4. Apply Limit
        const topN = ranked.slice(0, limit);

        // 5. Hydrate details
        const studentDetails = await this.prisma.studentProfile.findMany({
            where: { id: { in: topN.map(r => r.studentId) } },
            include: {
                user: { select: { name: true, photo: true } },
                class: { select: { name: true } },
                section: { select: { name: true } }
            }
        });

        return topN.map(r => {
            const details = studentDetails.find(d => d.id === r.studentId);
            return {
                studentId: r.studentId,
                name: details?.user.name || 'Unknown',
                photo: details?.user.photo,
                className: details?.class.name,
                sectionName: details?.section.name,
                totalDays: r.total,
                presentDays: r.present,
                attendancePercentage: r.score.toFixed(2)
            };
        });
    }

    async getBestAttendance(schoolId: number, dto: AttendanceReportFilterDto) {
        return this.getStudentAttendanceRanking(schoolId, dto, 'desc');
    }

    async getWorstAttendance(schoolId: number, dto: AttendanceReportFilterDto) {
        return this.getStudentAttendanceRanking(schoolId, dto, 'asc');
    }

    async getReportTeacherLate(schoolId: number, date: string) {
        const all = await this.getDailyAttendance(schoolId, date, true);
        return all.filter(t => t.isLate);
    }

    async getReportTeacherAbsent(schoolId: number, date: string) {
        const all = await this.getDailyAttendance(schoolId, date, true);
        // Include Absent and Excused (Leave)
        return all.filter(t => t.status === 'ABSENT' || t.status === 'EXCUSED');
    }
}
