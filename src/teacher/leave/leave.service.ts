import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ApplyLeaveDto } from './dto/apply-leave.dto';
import { UpdateLeaveDto } from './dto/update-leave.dto';
import { LeaveStatus } from '@prisma/client';
import { CalendarService } from '../../principal/calendar/calendar.service';

@Injectable()
export class TeacherLeaveService {
    private readonly logger = new Logger(TeacherLeaveService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly calendarService: CalendarService
    ) { }

    async applyLeave(user: any, dto: ApplyLeaveDto) {
        const { schoolId, academicYearId } = user;
        const { startDate, endDate, leaveTypeId, attachments } = dto;

        this.logger.log(`Teacher ${user.id} applying for leave in School ${schoolId} from ${startDate} to ${endDate}`);

        try {
            const startD = new Date(startDate);
            const endD = new Date(endDate);

            if (startD > endD) {
                throw new BadRequestException('Start date cannot be after end date');
            }

            // 1. Check for Overlapping Requests
            const overlap = await this.prisma.leaveRequest.count({
                where: {
                    schoolId,
                    applicantId: user.id,
                    status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] },
                    AND: [
                        { startDate: { lte: endD } },
                        { endDate: { gte: startD } }
                    ]
                }
            });

            if (overlap > 0) {
                throw new BadRequestException('You already have an active leave request for this period.');
            }

            // 2. Calculate Effective Days (Excluding Holidays/Weekends)
            const daysCount = await this.computeEffectiveDays(schoolId, startDate, endDate);
            if (daysCount === 0) {
                throw new BadRequestException('Selected dates consist entirely of holidays or non-working days.');
            }

            // 3. Resolve Teacher Profile (for Exam Duty Check)
            const teacherProfile = await this.prisma.teacherProfile.findUnique({
                where: { userId: user.id }
            });

            // 4. Check for Exam Invigilation Conflicts (Enterprise Guard)
            if (teacherProfile) {
                const examDuties = await this.prisma.invigilatorAssignment.findMany({
                    where: {
                        teacherId: teacherProfile.id,
                        academicYearId,
                        schedule: {
                            examDate: { gte: startD, lte: endD }
                        }
                    },
                    include: { schedule: { include: { exam: true, subject: true } } }
                });

                if (examDuties.length > 0) {
                    const dutyDates = examDuties.map(d => d.schedule.examDate?.toDateString()).join(', ');
                    // We allow applying but maybe warn? Or block?
                    // User requested "Enterprise ready", so let's BLOCK or explicitly flag.
                    // Let's block for now to ensure institutional integrity.
                    throw new BadRequestException(`Conflict detected: You are assigned for exam invigilation on ${dutyDates}. Please swap duty before applying.`);
                }
            }

            // 5. Entitlement Validation (Leave Balance)
            const balance = await this.prisma.leaveBalance.findUnique({
                where: {
                    userId_academicYearId_leaveTypeId: {
                        userId: user.id,
                        academicYearId,
                        leaveTypeId
                    }
                }
            });

            if (!balance) {
                throw new BadRequestException('Leave balance not initialized for this category. Contact administration.');
            }

            const remaining = balance.allowance - balance.used - balance.pending;
            if (daysCount > remaining) {
                throw new BadRequestException(`Insufficient leave balance. Requested: ${daysCount}, Available: ${remaining}`);
            }

            // 6. Transactional Creation & Balance Lock
            const leaveRequest = await this.prisma.$transaction(async (tx) => {
                // Update Balance (Add to Pending)
                await tx.leaveBalance.update({
                    where: { id: balance.id },
                    data: { pending: { increment: daysCount } }
                });

                // Create Request
                return tx.leaveRequest.create({
                    data: {
                        schoolId,
                        academicYearId,
                        applicantId: user.id,
                        leaveTypeId,
                        startDate: startD,
                        endDate: endD,
                        daysCount,
                        reason: dto.reason,
                        status: LeaveStatus.PENDING,
                        attachments: {
                            create: attachments?.map(att => ({
                                fileUrl: att.fileUrl,
                                name: att.name,
                                type: att.type
                            }))
                        }
                    },
                    include: {
                        leaveType: true,
                        attachments: true,
                    },
                });
            });

            return {
                ...leaveRequest,
                _meta: {
                    message: `Leave request for ${daysCount} days submitted for approval.`
                }
            };
        } catch (error) {
            this.handleError(error, 'Leave Application Service Failure');
        }
    }

    async findAll(user: any, page: number = 1, limit: number = 10) {
        // Scalable Pagination
        const skip = (page - 1) * limit;

        try {
            const [data, total] = await this.prisma.$transaction([
                this.prisma.leaveRequest.findMany({
                    where: {
                        schoolId: user.schoolId,
                        applicantId: user.id,
                    },
                    include: {
                        leaveType: true,
                        attachments: true,
                    },
                    orderBy: { createdAt: 'desc' },
                    skip,
                    take: limit,
                }),
                this.prisma.leaveRequest.count({
                    where: {
                        schoolId: user.schoolId,
                        applicantId: user.id,
                    }
                })
            ]);

            return {
                data,
                meta: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            this.handleError(error, 'Failed to retrieve leave history');
        }
    }

    async findOne(user: any, id: number) {
        const request = await this.prisma.leaveRequest.findFirst({
            where: {
                id,
                schoolId: user.schoolId,
                applicantId: user.id,
            },
            include: {
                leaveType: true,
                attachments: true,
                approvedBy: {
                    select: { name: true }
                }
            },
        });
        if (!request) throw new NotFoundException('Leave request not found');
        return request;
    }

    async update(user: any, id: number, dto: UpdateLeaveDto) {
        const request = await this.findOne(user, id);

        if (request.status !== LeaveStatus.PENDING) {
            throw new BadRequestException('Only pending requests can be edited');
        }

        const { schoolId, academicYearId } = user;
        let daysCount = request.daysCount;
        const startD = dto.startDate ? new Date(dto.startDate) : request.startDate;
        const endD = dto.endDate ? new Date(dto.endDate) : request.endDate;

        if (startD > endD) throw new BadRequestException('Start date cannot be after end date');
        
        if (dto.startDate || dto.endDate) {
            daysCount = await this.computeEffectiveDays(schoolId, startD, endD);
            if (daysCount === 0) throw new BadRequestException('New date range consists only of holidays.');
        }

        const diff = daysCount - request.daysCount;

        // If days increased, check balance
        if (diff > 0) {
            const balance = await this.prisma.leaveBalance.findUnique({
                where: { userId_academicYearId_leaveTypeId: { userId: user.id, academicYearId, leaveTypeId: request.leaveTypeId } }
            });
            const remaining = (balance?.allowance || 0) - (balance?.used || 0) - (balance?.pending || 0);
            if (diff > remaining) throw new BadRequestException(`Insufficient balance for the additional ${diff} days.`);
        }

        const updateData: any = {
            ...dto,
            startDate: dto.startDate ? startD : undefined,
            endDate: dto.endDate ? endD : undefined,
            daysCount,
        };

        delete updateData.attachments;

        return this.prisma.$transaction(async (tx) => {
            // Adjust Balance
            if (diff !== 0) {
                await tx.leaveBalance.update({
                    where: { userId_academicYearId_leaveTypeId: { userId: user.id, academicYearId, leaveTypeId: request.leaveTypeId } },
                    data: { pending: { increment: diff } }
                });
            }

            if (dto.attachments) {
                await tx.leaveAttachment.deleteMany({ where: { leaveRequestId: id } });
                await tx.leaveAttachment.createMany({
                    data: dto.attachments.map(att => ({
                        leaveRequestId: id,
                        fileUrl: att.fileUrl,
                        name: att.name,
                        type: att.type
                    }))
                });
            }

            return tx.leaveRequest.update({
                where: { id },
                data: updateData,
                include: { leaveType: true, attachments: true }
            });
        });
    }

    async cancel(user: any, id: number) {
        const request = await this.findOne(user, id);

        if (request.status !== LeaveStatus.PENDING) {
            throw new BadRequestException('Cannot cancel processed requests. Contact admin.');
        }

        return this.prisma.$transaction(async (tx) => {
            // Restore Balance
            await tx.leaveBalance.update({
                where: {
                    userId_academicYearId_leaveTypeId: {
                        userId: user.id,
                        academicYearId: user.academicYearId,
                        leaveTypeId: request.leaveTypeId
                    }
                },
                data: { pending: { decrement: request.daysCount } }
            });

            return tx.leaveRequest.update({
                where: { id },
                data: { status: LeaveStatus.CANCELLED },
            });
        });
    }

    async getLeaveTypes(schoolId: number) {
        return this.prisma.leaveType.findMany({
            where: { schoolId, isActive: true, category: 'TEACHER' }
        });
    }

    async getMyBalances(user: any) {
        return this.prisma.leaveBalance.findMany({
            where: {
                userId: user.id,
                academicYearId: user.academicYearId,
                schoolId: user.schoolId
            },
            include: {
                leaveType: { select: { name: true, code: true, color: true } }
            }
        });
    }

    async getStats(user: any) {
        const { schoolId, academicYearId, id: applicantId } = user;

        // 1. Fetch all requests for this user in current AY
        const allRequests = await this.prisma.leaveRequest.findMany({
            where: {
                schoolId,
                academicYearId,
                applicantId
            },
            include: { leaveType: true },
            orderBy: { createdAt: 'desc' }
        });

        // 2. Computed Aggregates
        const summary = {
            totalApplied: allRequests.length,
            approved: 0,
            pending: 0,
            rejected: 0,
            totalDaysTaken: 0
        };

        const byTypeMap = new Map<number, {
            typeId: number;
            typeName: string;
            code: string;
            color: string;
            daysTaken: number;
            requestCount: number;
        }>();

        const monthlyData = new Map<string, number>(); // "Jan 2026" -> days

        for (const req of allRequests) {
            // Summary Counts
            if (req.status === LeaveStatus.APPROVED) {
                summary.approved++;
                summary.totalDaysTaken += req.daysCount;

                // Monthly Breakdown (based on Start Date)
                const monthKey = req.startDate.toLocaleString('default', { month: 'short', year: 'numeric' });
                const currentMonthVal = monthlyData.get(monthKey) || 0;
                monthlyData.set(monthKey, currentMonthVal + req.daysCount);

            } else if (req.status === LeaveStatus.PENDING) {
                summary.pending++;
            } else if (req.status === LeaveStatus.REJECTED) {
                summary.rejected++;
            }

            // Type Breakdown
            if (!byTypeMap.has(req.leaveTypeId)) {
                byTypeMap.set(req.leaveTypeId, {
                    typeId: req.leaveTypeId,
                    typeName: req.leaveType.name,
                    code: req.leaveType.code,
                    color: req.leaveType.color || '#3b82f6', // Default blue
                    daysTaken: 0,
                    requestCount: 0
                });
            }

            const typeStats = byTypeMap.get(req.leaveTypeId)!;
            typeStats.requestCount++;
            if (req.status === LeaveStatus.APPROVED) {
                typeStats.daysTaken += req.daysCount;
            }
        }

        // 3. Format Output
        return {
            summary,
            byType: Array.from(byTypeMap.values()),
            monthlyBreakdown: Array.from(monthlyData.entries()).map(([month, days]) => ({ month, days })),
            recentActivity: allRequests.slice(0, 5) // Last 5
        };
    }

    // --- Helpers ---

    private async computeEffectiveDays(schoolId: number, startStr: string | Date, endStr: string | Date): Promise<number> {
        // Ensure string format YYYY-MM-DD
        const start = startStr instanceof Date ? startStr.toISOString().split('T')[0] : startStr;
        const end = endStr instanceof Date ? endStr.toISOString().split('T')[0] : endStr;

        const calendar = await this.calendarService.generateCalendar(schoolId, start, end);

        // Count ONLY working days
        let count = 0;
        for (const day of calendar.days) {
            if (day.isWorking) count++;
        }
        return count;
    }

    // Deprecated simple calc
    private calculateDays(start: Date, end: Date): number {
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        return diffDays;
    }
    private handleError(error: any, context: string) {
        this.logger.error(`${context}: ${error.message}`, error.stack);
        if (error instanceof BadRequestException || error instanceof NotFoundException || error instanceof ForbiddenException) {
            throw error;
        }
        throw new InternalServerErrorException('An unexpected error occurred. Please try again later.');
    }
}
