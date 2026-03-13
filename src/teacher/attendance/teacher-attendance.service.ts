// @ts-nocheck
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceConfigService } from 'src/principal/attendance-config/attendance-config.service';
import { TakeAttendanceDto } from './dto/take-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { AttendanceMode, AttendanceStatus, DailyAttendanceAccess, DayOfWeek } from '@prisma/client';
import { MarkStudentLateDto } from './dto/mark-student-late.dto';

@Injectable()
export class TeacherAttendanceService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: AttendanceConfigService,
    ) { }

    async getConfig(schoolId: number, academicYearId: number) {
        return this.configService.getConfig(schoolId, academicYearId);
    }

    async takeAttendance(teacherId: number, dto: TakeAttendanceDto) {
        // 1. Fetch Teacher Profile with School ID
        const teacher = await this.prisma.teacherProfile.findUnique({
            where: { userId: teacherId },
            include: { school: true }
        });

        if (!teacher) {
            throw new NotFoundException('Teacher profile not found for this user.');
        }

        const schoolId = teacher.schoolId;

        // 1b. Validate Date (Holiday Check)
        const attendanceDate = new Date(dto.date);
        // Normalize to UTC midnight to match how holidays are stored (usually)
        // or just ensure we're comparing correctly. 
        // Best practice: Set time to 00:00:00.000 Z if your DB stores dates as UTC midnight.
        // Assuming the input `dto.date` is ISO string like '2023-10-25' or '2023-10-25T...'
        attendanceDate.setUTCHours(0, 0, 0, 0);

        const holiday = await this.prisma.calendarException.findFirst({
            where: {
                schoolId,
                academicYearId: dto.academicYearId,
                date: attendanceDate,
                OR: [
                    { classId: undefined }, // School-wide holiday
                    { classId: dto.classId } // Class-specific holiday
                ]
            }
        });

        if (holiday && holiday.type === 'HOLIDAY') {
            throw new BadRequestException(`Cannot take attendance on a holiday: ${holiday.title || 'Holiday'}`);
        }

        // 2. Check Attendance Configuration
        const config = await this.configService.getConfig(schoolId, dto.academicYearId);

        // 3. Validate Mode (DAILY vs SUBJECT_WISE)
        if (config.mode === AttendanceMode.DAILY) {
            if (dto.subjectId || dto.timePeriodId) {
                throw new BadRequestException('Attendance mode is configured as DAILY. Subject and Period should not be provided.');
            }
        } else if (config.mode === AttendanceMode.PERIOD_WISE) {
            if (!dto.subjectId) {
                throw new BadRequestException('Attendance mode is configured as PERIOD_WISE. Subject ID is required.');
            }
        }

        // 4. Validate Authorization
        if (config.mode === AttendanceMode.DAILY) {
            if (config.responsibility === DailyAttendanceAccess.FIRST_PERIOD_TEACHER) {
                // Find first period teacher for this class/section and day
                const dayOfWeek = this.getDayOfWeek(attendanceDate);
                const firstEntry = await this.prisma.timetableEntry.findFirst({
                    where: {
                        schoolId,
                        academicYearId: dto.academicYearId,
                        group: { classId: dto.classId, sectionId: dto.sectionId },
                        day: dayOfWeek,
                        status: 'PUBLISHED',
                    },
                    include: { timeSlot: true },
                    orderBy: { timeSlot: { startTime: 'asc' } }
                });

                if (!firstEntry) {
                    throw new BadRequestException('No timetable entry found for this class today. Attendance cannot be taken.');
                }

                if (firstEntry.teacherId !== teacher.id) {
                    throw new ForbiddenException('Only the teacher of the first period is authorized to mark daily attendance.');
                }
            } else {
                // Default: CLASS_TEACHER logic
                const isSectionTeacher = await this.prisma.sectionTeacher.findFirst({
                    where: {
                        teacherId: teacher.id,
                        sectionId: dto.sectionId,
                    }
                });

                if (!isSectionTeacher) {
                    const isClassHead = await this.prisma.classHeadTeacher.findUnique({
                        where: { classId: dto.classId }
                    });

                    const authorized = isClassHead && isClassHead.teacherId === teacher.id;
                    if (!authorized) {
                        throw new ForbiddenException('Only the assigned Class Teacher can take attendance.');
                    }
                }
            }
        } else if (config.mode === AttendanceMode.PERIOD_WISE) {
            // PERIOD_WISE: Check if teacher is assigned to this period/subject
            const dayOfWeek = this.getDayOfWeek(attendanceDate);
            const isAuthorized = await this.prisma.timetableEntry.findFirst({
                where: {
                    schoolId,
                    academicYearId: dto.academicYearId,
                    teacherId: teacher.id,
                    group: { classId: dto.classId, sectionId: dto.sectionId },
                    subjectId: dto.subjectId,
                    day: dayOfWeek,
                    status: 'PUBLISHED',
                    timeSlot: dto.timePeriodId ? { id: dto.timePeriodId } : undefined,
                }
            });

            if (!isAuthorized) {
                throw new ForbiddenException('You are not authorized to mark attendance for this period/subject.');
            }
        }

        // 5. Fetch Approved Leaves for Logic (Auto-Excused)
        const leaves = await this.getLeavesForAttendance(schoolId, dto.classId, dto.sectionId, attendanceDate);
        const leaveMap = new Map<number, any>();
        leaves.forEach(l => {
            if (l.studentProfileId) leaveMap.set(l.studentProfileId, l);
        });

        // 6. Create Attendance Session
        // Check if session already exists
        // 5. Create or Get Attendance Session
        const academicGroup = await this.prisma.academicGroup.findFirst({
            where: { schoolId, sectionId: dto.sectionId }
        });
        
        if (!academicGroup) {
            throw new BadRequestException('Matching Academic Group not found for the provided section.');
        }
        
        const validGroupId = academicGroup.id;

        let session = await this.prisma.attendanceSession.findFirst({
            where: {
                schoolId,
                academicYearId: dto.academicYearId,
                groupId: validGroupId,
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
                        groupId: validGroupId,
                        classId: dto.classId,
                        sectionId: dto.sectionId,
                        subjectId: dto.subjectId,
                        timePeriodId: dto.timePeriodId || undefined,
                        date: new Date(dto.date),
                        markedById: teacher.userId,
                        takenAt: new Date(),
                    }
                });
            } else {
                // Optional: Update session metadata if needed (e.g., mark as fully taken if it was just a partial late-creation)
                // For now, we update takenAt to reflect the full roll call time
                await tx.attendanceSession.update({
                    where: { id: session.id },
                    data: {
                        takenAt: new Date(),
                        markedById: teacher.userId, // Update to the teacher taking the full attendance
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
                    console.warn(`Skipping attendance record: Missing valid studentProfileId or userId. Record: ${JSON.stringify(record)}`);
                    continue;
                }

                // Check for Leave
                let finalStatus = record.status;
                let finalRemarks = record.remarks;

                const leave = leaveMap.get(pid as number);
                if (leave) {
                    finalStatus = AttendanceStatus.EXCUSED;
                    finalRemarks = finalRemarks ? `${finalRemarks} | On Leave` : 'On Leave';
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
                        // Strategy: Overwrite status and remarks. preserve isLate if status is PRESENT.
                        status: finalStatus,
                        remarks: finalRemarks,
                    },
                    create: {
                        schoolId,
                        attendanceSessionId: session.id,
                        studentProfileId: pid as number,
                        status: finalStatus,
                        remarks: finalRemarks,
                    }
                });
            }

            return { message: 'Attendance recorded successfully', sessionId: session.id };
        });
    }

    async markStudentLate(teacherId: number, dto: MarkStudentLateDto) {
        // 1. Fetch Teacher Profile with School ID
        const teacher = await this.prisma.teacherProfile.findUnique({
            where: { userId: teacherId },
        });

        if (!teacher) {
            throw new NotFoundException('Teacher profile not found for this user.');
        }

        const schoolId = teacher.schoolId;

        // 2. Check if teacher is authorized as Late Attendance Monitor
        console.log('Checking authorization for:', {
            schoolId,
            academicYearId: dto.academicYearId,
            teacherId: teacher.id,
            userId: teacherId
        });

        const isAuthorized = await this.prisma.lateAttendanceMonitor.findUnique({
            where: {
                schoolId_academicYearId_teacherId: {
                    schoolId,
                    academicYearId: dto.academicYearId,
                    teacherId: teacher.id,
                }
            }
        });

        console.log('Authorization result:', isAuthorized);

        if (!isAuthorized) {
            // Provide detailed error message
            const allMonitors = await this.prisma.lateAttendanceMonitor.findMany({
                where: {
                    schoolId,
                    academicYearId: dto.academicYearId,
                }
            });

            throw new ForbiddenException(
                `You are not authorized to mark students as late. ` +
                `Teacher ID: ${teacher.id}, School ID: ${schoolId}, Academic Year: ${dto.academicYearId}. ` +
                `Assigned monitors for this year: ${allMonitors.map(m => m.teacherId).join(', ') || 'None'}`
            );
        }

        // 3. Verify student belongs to the same school
        console.log('Looking for student by User ID:', {
            userId: dto.userId,
            schoolId: schoolId
        });

        const student = await this.prisma.studentProfile.findFirst({
            where: {
                userId: dto.userId,
                schoolId,
            }
        });

        console.log('Student found:', student);

        if (!student) {
            // Check if student exists at all
            const userExists = await this.prisma.user.findUnique({
                where: { id: dto.userId },
                include: { studentProfile: true }
            });

            throw new NotFoundException(
                `Student not found in your school. ` +
                `Looking for User ID: ${dto.userId} in School ID: ${schoolId}. ` +
                `User exists: ${userExists ? 'Yes' : 'No'}. ` +
                `Has Student Profile: ${userExists?.studentProfile ? 'Yes' : 'No'}. ` +
                `Profile School ID: ${userExists?.studentProfile?.schoolId}`
            );
        }

        // 4. Check if attendance session exists for this class/section/date
        const attendanceDate = new Date(dto.date);

        // Find or create attendance session for daily attendance
        let session = await this.prisma.attendanceSession.findFirst({
            where: {
                schoolId,
                academicYearId: dto.academicYearId,
                groupId: 0, classId: dto.classId,
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
                    groupId: 0, classId: dto.classId,
                    sectionId: dto.sectionId,
                    date: attendanceDate,
                    markedById: teacherId,
                    remarks: 'Late arrival session',
                }
            });
        }

        // 5. Create or update attendance record with LATE status
        const attendance = await this.prisma.attendance.upsert({
            where: {
                schoolId_attendanceSessionId_studentProfileId: {
                    schoolId,
                    attendanceSessionId: session.id,
                    studentProfileId: student.id,
                }
            },
            update: {
                status: AttendanceStatus.PRESENT, // Late implies Present
                isLate: true,
                lateReason: dto.lateReason,
                lateMarkedAt: new Date(),
                lateMarkedById: teacherId,
            },
            create: {
                schoolId,
                attendanceSessionId: session.id,
                studentProfileId: student.id,
                status: AttendanceStatus.PRESENT, // Late implies Present
                isLate: true,
                lateReason: dto.lateReason,
                lateMarkedAt: new Date(),
                lateMarkedById: teacherId,
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

    async getSession(
        schoolId: number,
        classId: number,
        sectionId: number,
        date: Date,
        subjectId?: number,
        timePeriodId?: number
    ) {
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
                }
            }
        });

        if (!session) {
            return null;
        }

        return {
            sessionId: session.id,
            date: session.date,
            takenAt: session.takenAt,
            attendances: (session as any).attendances
                .filter(a => a.studentProfile) // Filter out corrupt records
                .map(a => ({
                    studentProfileId: a.studentProfileId,
                    userId: a.studentProfile?.userId, // ADDED: Match by UserID
                    studentName: a.studentProfile?.user?.name || 'Unknown Student',
                    status: a.status,
                    remarks: a.remarks,
                    isLate: a.isLate,
                    lateReason: a.lateReason,
                }))
        };
    }

    async getMonthlyAttendance(
        schoolId: number,
        classId: number,
        sectionId: number,
        year: number,
        month: number,
        subjectId?: number
    ) {
        // Calculate start and end dates for the month
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);

        const sessions = await this.prisma.attendanceSession.findMany({
            where: {
                schoolId,
                classId,
                sectionId,
                subjectId: subjectId || undefined,
                date: {
                    gte: startDate,
                    lte: endDate,
                }
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
                }
            },
            orderBy: {
                date: 'asc'
            }
        });

        return sessions.map(session => ({
            sessionId: session.id,
            date: session.date,
            takenAt: session.takenAt,
            attendances: (session as any).attendances
                .filter(a => a.studentProfile) // Filter out corrupt records
                .map(a => ({
                    studentProfileId: a.studentProfileId,
                    userId: a.studentProfile?.userId, // Match by UserID
                    studentName: a.studentProfile?.user?.name || 'Unknown Student',
                    rollNo: a.studentProfile?.rollNo, // Added rollNo
                    photo: a.studentProfile?.user?.photo, // Added photo
                    status: a.status,
                    remarks: a.remarks,
                    isLate: a.isLate, // Added isLate
                    lateReason: a.lateReason, // Added lateReason
                }))
        }));
    }

    async updateAttendance(teacherId: number, dto: UpdateAttendanceDto) {
        // 1. Fetch Teacher Profile
        const teacher = await this.prisma.teacherProfile.findUnique({
            where: { userId: teacherId },
        });

        if (!teacher) {
            throw new NotFoundException('Teacher profile not found for this user.');
        }

        const schoolId = teacher.schoolId;

        // 2. Find the existing session
        const session = await this.prisma.attendanceSession.findFirst({
            where: {
                schoolId,
                academicYearId: dto.academicYearId,
                groupId: 0, classId: dto.classId,
                sectionId: dto.sectionId,
                subjectId: dto.subjectId || undefined,
                timePeriodId: dto.timePeriodId || undefined || undefined,
                date: new Date(dto.date),
            }
        });

        if (!session) {
            throw new NotFoundException('Attendance session not found for this date.');
        }

        // 3. Update attendance records
        const results: any[] = [];
        for (const update of dto.updates) {
            const attendance = await this.prisma.attendance.updateMany({
                where: {
                    schoolId,
                    attendanceSessionId: session.id,
                    studentProfileId: update.studentProfileId,
                },
                data: {
                    status: update.status,
                    remarks: update.remarks,
                }
            });
            results.push(attendance);
        }

        return { message: 'Attendance updated successfully', count: results.length };
    }

    async getLeavesForAttendance(
        schoolId: number,
        classId: number,
        sectionId: number,
        date: Date
    ) {
        // Get all students in the section
        const students = await this.prisma.studentProfile.findMany({
            where: {
                schoolId,
                classId,
                sectionId,
            },
            select: {
                id: true,
                userId: true,
            }
        });

        const studentUserIds = students.map(s => s.userId);

        // Use overlap logic similar to what I fixed
        const startOfDay = new Date(date);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setUTCHours(23, 59, 59, 999);

        // Get approved leaves for these students on this date
        const leaves = await this.prisma.leaveRequest.findMany({
            where: {
                schoolId,
                applicantId: { in: studentUserIds },
                status: 'APPROVED',
                startDate: { lte: endOfDay },
                endDate: { gte: startOfDay },
            },
            include: {
                applicant: {
                    select: {
                        id: true,
                        name: true,
                        studentProfile: {
                            select: {
                                id: true,
                            }
                        }
                    }
                }
            }
        });

        return leaves.map(leave => ({
            studentProfileId: leave.applicant.studentProfile?.id,
            userId: leave.applicantId, // ADDED: Ensuring userId is returned for frontend matching
            studentName: leave.applicant.name,
            leaveType: leave.leaveTypeId,
            startDate: leave.startDate,
            endDate: leave.endDate,
            reason: leave.reason,
        }));
    }

    async getLateStudentsForAttendance(
        schoolId: number,
        classId: number,
        sectionId: number,
        date: Date
    ) {
        console.log(`[getLateStudents] Inputs: School=${schoolId}, Class=${classId}, Section=${sectionId}, Date=${date}`);

        const startOfDay = new Date(date);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setUTCHours(23, 59, 59, 999);

        // Find daily attendance session for this date range
        const session = await this.prisma.attendanceSession.findFirst({
            where: {
                schoolId,
                classId,
                sectionId,
                date: {
                    gte: startOfDay,
                    lte: endOfDay
                },
                subjectId: undefined, // Only checking daily attendance for late status
                timePeriodId: undefined,
            },
            include: {
                attendances: {
                    where: {
                        isLate: true
                    },
                    include: {
                        studentProfile: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        name: true,
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!session) {
            console.log(`[getLateStudents] No session found for date range ${startOfDay.toISOString()} - ${endOfDay.toISOString()}`);
            return [];
        }

        console.log(`[getLateStudents] Found session ${session.id} with ${(session as any).attendances.length} late records.`);

        return (session as any).attendances.map(a => ({
            studentProfileId: a.studentProfileId,
            studentName: a?.studentProfile?.user.name,
            userId: a?.studentProfile?.user.id,
            lateReason: a.lateReason,
            lateMarkedAt: a.lateMarkedAt,
        }));
    }

    async deleteSession(teacherId: number, sessionId: number) {
        // 1. Fetch Teacher Profile
        const teacher = await this.prisma.teacherProfile.findUnique({
            where: { userId: teacherId },
        });

        if (!teacher) {
            throw new NotFoundException('Teacher profile not found for this user.');
        }

        // 2. Verify session exists and belongs to this school
        const session = await this.prisma.attendanceSession.findFirst({
            where: {
                id: sessionId,
                schoolId: teacher.schoolId,
            }
        });

        if (!session) {
            throw new NotFoundException('Attendance session not found.');
        }

        // 3. Delete the session (cascade will delete attendance records)
        await this.prisma.attendanceSession.delete({
            where: { id: sessionId }
        });

        return { message: 'Attendance session deleted successfully' };
    }


    async unmarkStudentLate(teacherId: number, schoolId: number, academicYearId: number, studentProfileId: number) {
        // 1. Authorization
        const teacher = await this.prisma.teacherProfile.findUnique({ where: { userId: teacherId } });
        if (!teacher) throw new ForbiddenException('Teacher not found');

        const isAuthorized = await this.prisma.lateAttendanceMonitor.findUnique({
            where: {
                schoolId_academicYearId_teacherId: {
                    schoolId,
                    academicYearId,
                    teacherId: teacher.id,
                }
            }
        });

        if (!isAuthorized) {
            throw new ForbiddenException('You are not authorized to manage late attendance.');
        }

        // 2. Find the attendance record
        const todayCommon = new Date();
        const startOfDay = new Date(todayCommon);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(todayCommon);
        endOfDay.setUTCHours(23, 59, 59, 999);

        const attendance = await this.prisma.attendance.findFirst({
            where: {
                schoolId,
                studentProfileId,
                isLate: true,
                session: {
                    date: {
                        gte: startOfDay,
                        lte: endOfDay
                    }
                }
            },
            include: { session: true }
        });

        if (!attendance) {
            throw new NotFoundException('No late marking found for this student today.');
        }

        // 3. Unmark
        await this.prisma.attendance.update({
            where: {
                schoolId_attendanceSessionId_studentProfileId: {
                    schoolId,
                    attendanceSessionId: attendance.attendanceSessionId,
                    studentProfileId,
                }
            },
            data: {
                isLate: false,
                lateReason: undefined,
                lateMarkedById: undefined,
                lateMarkedAt: undefined,
            }
        });

        return { message: 'Student late status removed successfully.' };
    }

    async searchStudentsForMonitor(teacherId: number, schoolId: number, query: string) {
        // 1. Authorization
        const teacher = await this.prisma.teacherProfile.findUnique({ where: { userId: teacherId } });
        if (!teacher) throw new ForbiddenException('Teacher not found');

        const isMonitor = await this.prisma.lateAttendanceMonitor.findFirst({
            where: {
                schoolId,
                teacherId: teacher.id,
            }
        });

        if (!isMonitor) {
            throw new ForbiddenException('You are not authorized to search students as a monitor.');
        }

        if (!query || query.length < 2) return [];

        return this.prisma.studentProfile.findMany({
            where: {
                schoolId,
                OR: [
                    { user: { name: { contains: query, mode: 'insensitive' } } },
                    { admissionNo: { contains: query, mode: 'insensitive' } },
                    { fullName: { contains: query, mode: 'insensitive' } },
                ]
            },
            take: 10,
            select: {
                id: true,
                classId: true,
                sectionId: true,
                admissionNo: true,
                rollNo: true,
                class: { select: { name: true } },
                section: { select: { name: true } },
                user: {
                    select: {
                        id: true,
                        name: true,
                        photo: true,
                    }
                }
            }
        });
    }
    async getStudentsForAttendance(teacherId: number, schoolId: number, classId?: number, sectionId?: number) {
        if (classId && sectionId) {
            return this.prisma.studentProfile.findMany({
                where: {
                    schoolId,
                    classId,
                    sectionId,
                },
                select: {
                    id: true,
                    classId: true,
                    sectionId: true,
                    userId: true,
                    rollNo: true,
                    fullName: true,
                    user: {
                        select: {
                            id: true,
                            name: true,
                            photo: true
                        }
                    }
                },
                orderBy: {
                    rollNo: 'asc'
                }
            });
        }
        return [];
    }

    async getDailyAssignments(teacherId: number, schoolId: number, academicYearId: number, dateStr: string) {
        const teacher = await this.prisma.teacherProfile.findUnique({
            where: { userId: teacherId }
        });
        if (!teacher) return [];

        const config = await this.configService.getConfig(schoolId, academicYearId);
        
        if (config.mode !== AttendanceMode.DAILY) {
            return []; // Only relevant for DAILY mode
        }

        if (config.responsibility === DailyAttendanceAccess.CLASS_TEACHER) {
            const assignments: any[] = [];
            
            const sectionTeacherRefs = await this.prisma.sectionTeacher.findMany({
                where: { teacherId: teacher.id },
                include: { section: { include: { class: true } } }
            });
            
            for (const ref of sectionTeacherRefs) {
                if (ref.section && ref.section.class) {
                    assignments.push({
                        type: 'DAILY',
                        classId: ref.section.classId,
                        className: ref.section.class.name,
                        sectionId: ref.sectionId,
                        sectionName: ref.section.name,
                    });
                }
            }

            const headTeacherRefs = await this.prisma.classHeadTeacher.findMany({
                where: { teacherId: teacher.id },
                include: { class: { include: { sections: true } } }
            });

            for (const ref of headTeacherRefs) {
                if (ref.class && ref.class.sections && ref.class.sections.length > 0) {
                    for (const section of ref.class.sections) {
                        if (!assignments.find(a => a.classId === ref.classId && a.sectionId === section.id)) {
                            assignments.push({
                                type: 'DAILY',
                                classId: ref.classId,
                                className: ref.class.name,
                                sectionId: section.id,
                                sectionName: section.name,
                            });
                        }
                    }
                }
            }
            
            return assignments;

        } else if (config.responsibility === DailyAttendanceAccess.FIRST_PERIOD_TEACHER) {
            const targetDate = new Date(dateStr);
            const dayOfWeek = this.getDayOfWeek(targetDate);
            
            const myEntriesToday = await this.prisma.timetableEntry.findMany({
                where: {
                    schoolId,
                    academicYearId,
                    teacherId: teacher.id,
                    day: dayOfWeek,
                    status: 'PUBLISHED'
                },
                include: {
                    group: { include: { class: true } },
                    timeSlot: true
                },
                orderBy: { timeSlot: { startTime: 'asc' } }
            });

            const assignments: any[] = [];
            const processedSections = new Set<number>();

            for (const entry of myEntriesToday) {
                if (!entry.groupId || processedSections.has(entry.groupId)) continue;
                
                const firstPeriodForSection = await this.prisma.timetableEntry.findFirst({
                    where: {
                        schoolId,
                        academicYearId,
                        groupId: entry.groupId,
                        day: dayOfWeek,
                        status: 'PUBLISHED'
                    },
                    include: { timeSlot: true },
                    orderBy: { timeSlot: { startTime: 'asc' } }
                });

                if (firstPeriodForSection && firstPeriodForSection.teacherId === teacher.id) {
                    assignments.push({
                        type: 'DAILY',
                        classId: entry.group.classId,
                        className: entry.group.class.name,
                        sectionId: entry.groupId,
                        sectionName: entry.group.name,
                    });
                    processedSections.add(entry.groupId);
                }
            }

            return assignments;
        }
        
        return [];
    }

    private getDayOfWeek(date: Date): DayOfWeek {

        const days: DayOfWeek[] = [
            DayOfWeek.SUNDAY,
            DayOfWeek.MONDAY,
            DayOfWeek.TUESDAY,
            DayOfWeek.WEDNESDAY,
            DayOfWeek.THURSDAY,
            DayOfWeek.FRIDAY,
            DayOfWeek.SATURDAY,
        ];
        return days[date.getDay()];
    }
}
