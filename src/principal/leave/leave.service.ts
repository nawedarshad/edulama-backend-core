import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LeaveActionDto } from './dto/leave-action.dto';
import { LeaveStatus, AttendanceStatus } from '@prisma/client';
import { CalendarService } from '../calendar/calendar.service';
import { NotificationService } from '../global/notification/notification.service';
import { NotificationType } from '@prisma/client';

@Injectable()
export class PrincipalLeaveService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly calendarService: CalendarService,
        private readonly notificationService: NotificationService
    ) { }

    async findAll(schoolId: number, query: any) {
        const { status, applicantId, startDate, endDate } = query;
        return this.prisma.leaveRequest.findMany({
            where: {
                schoolId,
                status: status ? status : undefined,
                applicantId: applicantId ? Number(applicantId) : undefined,
                startDate: startDate ? { gte: new Date(startDate) } : undefined,
                endDate: endDate ? { lte: new Date(endDate) } : undefined,
            },
            include: {
                leaveType: true,
                applicant: {
                    select: { id: true, name: true, photo: true }
                },
                attachments: true,
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async findOne(schoolId: number, id: number) {
        const request = await this.prisma.leaveRequest.findFirst({
            where: { id, schoolId },
            include: {
                leaveType: true,
                applicant: {
                    select: { id: true, name: true, photo: true }
                },
                attachments: true,
                approvedBy: {
                    select: { name: true }
                }
            }
        });

        if (!request) throw new NotFoundException('Leave request not found');
        return request;
    }

    async action(user: any, id: number, dto: LeaveActionDto) {
        const request = await this.prisma.leaveRequest.findFirst({
            where: { id, schoolId: user.schoolId },
            include: { leaveType: true }
        });

        if (!request) throw new NotFoundException('Leave request not found');
        if (request.status !== LeaveStatus.PENDING) {
            throw new BadRequestException('This request has already been processed.');
        }

        const { status } = dto;
        const { schoolId, academicYearId } = user;

        const result = await this.prisma.$transaction(async (tx) => {
            // 1. Update Request
            const updated = await tx.leaveRequest.update({
                where: { id },
                data: {
                    status,
                    approvedById: user.id,
                    rejectionReason: dto.rejectionReason,
                    actionAt: new Date(),
                },
                include: { leaveType: true }
            });

            // 2. Resolve Balance
            const balance = await tx.leaveBalance.findUnique({
                where: {
                    userId_academicYearId_leaveTypeId: {
                        userId: request.applicantId,
                        academicYearId: request.academicYearId,
                        leaveTypeId: request.leaveTypeId
                    }
                }
            });

            // 3. Balance Ledger Management
            if (balance) {
                if (status === LeaveStatus.APPROVED) {
                    // Move from Pending to Used
                    await tx.leaveBalance.update({
                        where: { id: balance.id },
                        data: {
                            pending: { decrement: request.daysCount },
                            used: { increment: request.daysCount }
                        }
                    });
                } else if (status === LeaveStatus.REJECTED) {
                    // Restore from Pending
                    await tx.leaveBalance.update({
                        where: { id: balance.id },
                        data: {
                            pending: { decrement: request.daysCount }
                        }
                    });
                }
            }

            // 4. Attendance Sync if APPROVED
            if (status === LeaveStatus.APPROVED) {
                let currentDate = new Date(request.startDate);
                const endDate = new Date(request.endDate);

                const teacherProfile = await tx.teacherProfile.findUnique({
                    where: { userId: request.applicantId }
                });

                if (teacherProfile) {
                    while (currentDate <= endDate) {
                        const dayValidation = await this.calendarService.validateDate(schoolId, currentDate);
                        if (dayValidation.isWorking) {
                            await tx.staffAttendance.upsert({
                                where: {
                                    schoolId_academicYearId_teacherId_date: {
                                        schoolId,
                                        academicYearId,
                                        teacherId: teacherProfile.id,
                                        date: currentDate
                                    }
                                },
                                create: {
                                    schoolId,
                                    academicYearId,
                                    teacherId: teacherProfile.id,
                                    date: currentDate,
                                    status: AttendanceStatus.EXCUSED,
                                    remarks: `Leave: ${updated.leaveType.name}`,
                                    isLate: false
                                },
                                update: {
                                    status: AttendanceStatus.EXCUSED,
                                    remarks: `Leave: ${updated.leaveType.name}`
                                }
                            });
                        }
                        currentDate.setDate(currentDate.getDate() + 1);
                    }
                }
            }

            return updated;
        });

        // Notifications
        if (result) {
            this.notificationService.create(schoolId, user.id, {
                title: `Leave ${result.status}`,
                message: `Your leave for ${result.startDate.toDateString()} has been ${result.status.toLowerCase()}.`,
                type: NotificationType.ATTENDANCE,
                targetUserIds: [result.applicantId]
            }).catch(err => console.error('Failed to notify staff', err));
        }

        return result;
    }

    async initializeBalances(schoolId: number, academicYearId: number, user: any) {
        // Find all staff (Teachers)
        const teachers = await this.prisma.teacherProfile.findMany({
            where: { schoolId },
            select: { userId: true }
        });

        const leaveTypes = await this.prisma.leaveType.findMany({
            where: { schoolId, category: 'TEACHER', isActive: true }
        });

        let createdCount = 0;
        await this.prisma.$transaction(async (tx) => {
            for (const teacher of teachers) {
                for (const type of leaveTypes) {
                    // Default values - can be adjusted via UI later
                    const allowance = type.code === 'CL' ? 12 : type.code === 'SL' ? 15 : 0;
                    
                    await tx.leaveBalance.upsert({
                        where: {
                            userId_academicYearId_leaveTypeId: {
                                userId: teacher.userId,
                                academicYearId,
                                leaveTypeId: type.id
                            }
                        },
                        create: {
                            schoolId,
                            academicYearId,
                            userId: teacher.userId,
                            leaveTypeId: type.id,
                            allowance
                        },
                        update: {} // Don't reset if exists
                    });
                    createdCount++;
                }
            }
        });

        return { message: `Successfully initialized ${createdCount} balance records.` };
    }

    async getBalances(schoolId: number, academicYearId: number) {
        return this.prisma.leaveBalance.findMany({
            where: { schoolId, academicYearId },
            include: {
                user: { select: { name: true, photo: true } },
                leaveType: { select: { name: true, code: true, color: true } }
            }
        });
    }

    async getTeacherLeaveSummary(schoolId: number, academicYearId: number) {
        // Fetch all approved leave requests for the academic year
        const leaveRequests = await this.prisma.leaveRequest.findMany({
            where: {
                schoolId,
                academicYearId,
                status: LeaveStatus.APPROVED
            },
            include: {
                applicant: {
                    select: { id: true, name: true, photo: true }
                },
                leaveType: {
                    select: { name: true, code: true, color: true }
                }
            }
        });

        // Group by teacher and calculate total days
        const teacherMap = new Map<number, {
            teacherId: number;
            teacherName: string;
            teacherPhoto: string | null;
            totalDaysTaken: number;
            leaveRequests: number;
            byType: Map<number, { typeName: string; code: string; color: string; days: number; count: number }>;
        }>();

        for (const req of leaveRequests) {
            if (!teacherMap.has(req.applicantId)) {
                teacherMap.set(req.applicantId, {
                    teacherId: req.applicantId,
                    teacherName: req.applicant.name,
                    teacherPhoto: req.applicant.photo,
                    totalDaysTaken: 0,
                    leaveRequests: 0,
                    byType: new Map()
                });
            }

            const teacherData = teacherMap.get(req.applicantId)!;
            teacherData.totalDaysTaken += req.daysCount;
            teacherData.leaveRequests++;

            // Track by leave type
            if (!teacherData.byType.has(req.leaveTypeId)) {
                teacherData.byType.set(req.leaveTypeId, {
                    typeName: req.leaveType.name,
                    code: req.leaveType.code,
                    color: req.leaveType.color || '#3b82f6',
                    days: 0,
                    count: 0
                });
            }

            const typeData = teacherData.byType.get(req.leaveTypeId)!;
            typeData.days += req.daysCount;
            typeData.count++;
        }

        // Convert to array and format
        return Array.from(teacherMap.values()).map(teacher => ({
            teacherId: teacher.teacherId,
            teacherName: teacher.teacherName,
            teacherPhoto: teacher.teacherPhoto,
            totalDaysTaken: teacher.totalDaysTaken,
            leaveRequests: teacher.leaveRequests,
            byType: Array.from(teacher.byType.values())
        })).sort((a, b) => b.totalDaysTaken - a.totalDaysTaken); // Sort by most days taken
    }
}
