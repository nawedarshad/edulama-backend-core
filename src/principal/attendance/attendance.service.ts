import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SchoolSettingsService } from '../global/school-settings/school-settings.service';
import { CreateAttendanceSessionDto } from './dto/create-attendance-session.dto';
import { AttendanceMode, DailyAttendanceAccess, DayOfWeek } from '@prisma/client';

@Injectable()
export class AttendanceService {
    private readonly logger = new Logger(AttendanceService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly settingsService: SchoolSettingsService,
    ) { }

    /**
     * Creates an attendance session respecting the global School Attendance Mode.
     */
    async createSession(schoolId: number, userId: number, dto: CreateAttendanceSessionDto) {
        // 1. Get School Settings to check mode
        const settings = await this.settingsService.getSettings(schoolId);
        const mode = settings?.attendanceMode || AttendanceMode.DAILY;

        this.logger.log(`Creating attendance session for school ${schoolId} in ${mode} mode.`);

        // 2. Validate based on mode
        if (mode === AttendanceMode.DAILY) {
            if (dto.subjectId || dto.periodId) {
                throw new BadRequestException(`Attendance Mode is configured as DAILY. Subject and Period should not be provided.`);
            }

            // Check Access Permission
            const access = settings?.dailyAttendanceAccess || 'CLASS_TEACHER';
            const teacherProfile = await this.prisma.teacherProfile.findUnique({ where: { userId } });

            if (!teacherProfile) {
                // If user is not a teacher (e.g. Admin), we might want to allow them? 
                // For now, strict check: if access is restricted to teachers, admins might be blocked unless we add an admin bypass.
                // Assuming Admins/Principals have a bypass in a real system or different guard. 
                // Here we strict check for "Teacher" roles as requested.
                // But let's allow if role is ADMIN/PRINCIPAL? The prompt implies "Access Control", usually overriding admins is fine.
                // Lets simpler: throw if not teacher profile found for these specific checks.
                throw new BadRequestException('User does not have a linked Teacher Profile.');
            }

            if (access === 'CLASS_TEACHER') {
                const isHead = await this.prisma.classHeadTeacher.findFirst({
                    where: {
                        classId: dto.classId,
                        teacherId: teacherProfile.id
                    }
                });

                if (!isHead) throw new BadRequestException('Only the Class Teacher can take daily attendance.');

            } else if (access === 'FIRST_PERIOD_TEACHER') {
                const dayOfWeek = this.getDayOfWeek(new Date(dto.date));

                // Find the first period of the day based on start time
                const firstEntry = await this.prisma.timetableEntry.findFirst({
                    where: {
                        classId: dto.classId,
                        sectionId: dto.sectionId,
                        day: dayOfWeek,
                        // We need the earliest period
                    },
                    include: {
                        teacher: { include: { user: true } },
                        period: true
                    },
                    orderBy: {
                        period: {
                            startTime: 'asc'
                        }
                    }
                });

                if (!firstEntry) {
                    // No timetable for today? Maybe allow Class Teacher as fallback?
                    // Or just block.
                    throw new BadRequestException('No timetable found for this day to determine First Period Teacher.');
                }

                if (firstEntry.teacherId !== teacherProfile.id) {
                    throw new BadRequestException(`Only the First Period Teacher (${firstEntry.teacher.user.name}) can take daily attendance.`);
                }
            }

        } else {
            // PERIOD_WISE
            if (!dto.subjectId || !dto.periodId) {
                throw new BadRequestException(`Attendance Mode is configured as PERIOD_WISE. Subject and Period are required.`);
            }
            // Implicitly: Only the teacher scheduled for this period should take attendance (or Admin/Substitute)
        }

        // 3. Resolve Academic Year
        const academicYear = await this.prisma.academicYear.findFirst({
            where: { schoolId, status: 'ACTIVE' },
        });
        if (!academicYear) {
            throw new BadRequestException('Active Academic Year not found for this school.');
        }

        // 4. Create Session
        try {
            const session = await this.prisma.attendanceSession.create({
                data: {
                    schoolId,
                    academicYearId: academicYear.id,
                    classId: dto.classId,
                    sectionId: dto.sectionId,
                    subjectId: dto.subjectId ?? null,
                    periodId: dto.periodId ?? null,
                    date: new Date(dto.date),
                    markedById: userId,
                }
            });
            return session;
        } catch (error) {
            if (error.code === 'P2002') {
                throw new BadRequestException('Attendance session already exists for this class/section/date/slot.');
            }
            throw error;
        }
    }

    async getSessions(schoolId: number, date?: string) {
        return this.prisma.attendanceSession.findMany({
            where: {
                schoolId,
                date: date ? new Date(date) : undefined,
            },
            include: {
                class: true,
                section: true,
                subject: true,
                markedBy: { select: { name: true } }
            },
            orderBy: { takenAt: 'desc' }
        });
    }

    async getSettings(schoolId: number) {
        return this.settingsService.getSettings(schoolId);
    }

    async updateSettings(schoolId: number, userId: number, dto: any, ip: string) {
        return this.settingsService.updateSettings(schoolId, userId, dto, ip);
    }

    private getDayOfWeek(date: Date): DayOfWeek {
        const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
        return days[date.getDay()] as DayOfWeek;
    }
}
