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
            if (new Date(startDate) > new Date(endDate)) {
                throw new BadRequestException('Start date cannot be after end date');
            }

            // 1. Check for Overlapping Requests
            const overlap = await this.prisma.leaveRequest.count({
                where: {
                    schoolId,
                    applicantId: user.id,
                    status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] },
                    AND: [
                        { startDate: { lte: new Date(endDate) } },
                        { endDate: { gte: new Date(startDate) } }
                    ]
                }
            });

            if (overlap > 0) {
                this.logger.warn(`Overlap detected for user ${user.id}`);
                throw new BadRequestException('You already have a leave request for this period.');
            }

            // 2. Calculate Days (Async with Calendar)
            const daysCount = await this.computeEffectiveDays(schoolId, startDate, endDate);

            // 3. Validate Leave Type
            const leaveType = await this.prisma.leaveType.findFirst({
                where: { id: leaveTypeId, schoolId, isActive: true },
            });
            if (!leaveType) throw new NotFoundException('Invalid or inactive leave type');

            // 4. Create Request
            const leaveRequest = await this.prisma.leaveRequest.create({
                data: {
                    schoolId,
                    academicYearId,
                    applicantId: user.id,
                    leaveTypeId,
                    startDate: new Date(startDate),
                    endDate: new Date(endDate),
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

            this.logger.log(`Leave request ${leaveRequest.id} created successfully.`);
            return {
                ...leaveRequest,
                _meta: {
                    message: `Leave request created for ${daysCount} effective working days.`
                }
            };
        } catch (error) {
            this.handleError(error, 'Failed to apply for leave');
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

        // Re-calc days if dates changed
        let daysCount = request.daysCount;
        if (dto.startDate || dto.endDate) {
            const start = dto.startDate ? new Date(dto.startDate) : request.startDate;
            const end = dto.endDate ? new Date(dto.endDate) : request.endDate;
            if (start > end) throw new BadRequestException('Start date cannot be after end date');
            daysCount = await this.computeEffectiveDays(user.schoolId, start, end);
        }

        // Handle attachments update (simple replace logic for now or just add? 
        // Usually easier to handle attachments separately in full production, but here we can just delete old and add new if provided)
        // For this MVP, if attachments are provided, we replace.

        const updateData: any = {
            ...dto,
            startDate: dto.startDate ? new Date(dto.startDate) : undefined,
            endDate: dto.endDate ? new Date(dto.endDate) : undefined,
            daysCount,
        };

        delete updateData.attachments; // handled separately

        return this.prisma.$transaction(async (tx) => {
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
            // Optional: Allow cancelling approved leaves if they haven't happened yet?
            // For now, strict: Only Pending.
            throw new BadRequestException('Cannot cancel processed requests. Contact admin.');
        }

        // We can either DELETE or set status to CANCELLED. CANCELLED is better for history.
        return this.prisma.leaveRequest.update({
            where: { id },
            data: { status: LeaveStatus.CANCELLED },
        });
    }

    async getLeaveTypes(schoolId: number) {
        return this.prisma.leaveType.findMany({
            where: { schoolId, isActive: true, category: 'TEACHER' }
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
