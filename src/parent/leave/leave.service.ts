import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CalendarService } from '../../principal/calendar/calendar.service';
import { ApplyStudentLeaveDto } from './dto/apply-student-leave.dto';
import { UpdateStudentLeaveDto } from './dto/update-student-leave.dto';
import { LeaveStatus, LeaveCategory, StudentLeaveApprovalWorkflow, DayType } from '@prisma/client';

@Injectable()
export class ParentLeaveService {
    private readonly logger = new Logger(ParentLeaveService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly calendarService: CalendarService
    ) { }

    /**
     * Apply for student leave with automatic workflow routing
     */
    async applyLeave(parentUser: any, dto: ApplyStudentLeaveDto) {
        const { schoolId, academicYearId } = parentUser;
        let { studentId } = dto;
        const { leaveTypeId, startDate, endDate, reason, attachments } = dto;

        // Auto-select student if not provided
        if (!studentId) {
            const children = await this.prisma.studentProfile.findMany({
                where: {
                    schoolId,
                    parents: {
                        some: {
                            parent: {
                                userId: parentUser.id
                            }
                        }
                    }
                },
                select: { id: true }
            });

            if (children.length === 1) {
                studentId = children[0].id;
            } else if (children.length > 1) {
                throw new BadRequestException('Multiple students found. Please select a student.');
            } else {
                throw new ForbiddenException('No student linked to this account.');
            }
        }

        this.logger.log(`Parent ${parentUser.id} applying leave for student ${studentId}`);

        try {
            // 1. Validate dates
            if (new Date(startDate) > new Date(endDate)) {
                throw new BadRequestException('Start date cannot be after end date');
            }

            // 2. Verify student belongs to parent
            const student = await this.prisma.studentProfile.findFirst({
                where: {
                    id: studentId,
                    schoolId,
                    parents: {
                        some: {
                            parent: {
                                userId: parentUser.id
                            }
                        }
                    }
                },
                include: {
                    class: {
                        select: {
                            id: true,
                            name: true,
                            // classTeacherId: true - Removed as it does not exist on Class model
                        }
                    }
                }
            });

            if (!student) {
                throw new ForbiddenException('You can only apply for leaves for your own children');
            }

            // 3. Check for overlapping leaves
            const overlap = await this.prisma.leaveRequest.count({
                where: {
                    schoolId,
                    applicantId: student.userId,
                    status: { in: [LeaveStatus.PENDING, LeaveStatus.PENDING_CLASS_TEACHER, LeaveStatus.APPROVED] },
                    AND: [
                        { startDate: { lte: new Date(endDate) } },
                        { endDate: { gte: new Date(startDate) } }
                    ]
                }
            });

            if (overlap > 0) {
                this.logger.warn(`Overlap detected for student ${studentId}`);
                throw new BadRequestException('Student already has a leave request for this period');
            }

            // 4. Get leave type and check workflow
            const leaveType = await this.prisma.leaveType.findFirst({
                where: {
                    id: leaveTypeId,
                    schoolId,
                    category: LeaveCategory.STUDENT,
                    isActive: true
                }
            });

            if (!leaveType) {
                throw new NotFoundException('Invalid or inactive student leave type');
            }

            // 5. Calculate effective working days
            const daysCount = await this.computeEffectiveDays(schoolId, startDate, endDate);

            // 6. Determine initial status based on workflow
            let initialStatus: LeaveStatus;
            if (leaveType.studentLeaveApprovalWorkflow === StudentLeaveApprovalWorkflow.CLASS_TEACHER_FIRST) {
                initialStatus = LeaveStatus.PENDING_CLASS_TEACHER;
                this.logger.log(`Leave routed to class teacher first for student ${studentId}`);
            } else {
                initialStatus = LeaveStatus.PENDING;
                this.logger.log(`Leave routed directly to principal for student ${studentId}`);
            }

            // 7. Create leave request
            const leaveRequest = await this.prisma.leaveRequest.create({
                data: {
                    schoolId,
                    academicYearId,
                    applicantId: student.userId,
                    leaveTypeId,
                    startDate: new Date(startDate),
                    endDate: new Date(endDate),
                    daysCount,
                    reason,
                    status: initialStatus,
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
                    applicant: {
                        select: {
                            id: true,
                            name: true,
                            studentProfile: {
                                select: {
                                    id: true,
                                    fullName: true,
                                    rollNo: true,
                                    class: {
                                        select: { name: true }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            this.logger.log(`Leave request ${leaveRequest.id} created with status ${initialStatus}`);
            return {
                ...leaveRequest,
                _meta: {
                    message: `Leave request created for ${daysCount} working days`,
                    studentName: leaveRequest.applicant?.studentProfile?.fullName,
                    workflow: leaveType.studentLeaveApprovalWorkflow,
                    nextApprover: initialStatus === LeaveStatus.PENDING_CLASS_TEACHER ? 'Class Teacher' : 'Principal'
                }
            };
        } catch (error) {
            this.handleError(error, 'Failed to apply for student leave');
        }
    }

    /**
     * Get all leave requests for parent's children
     */
    async findAll(parentUser: any, page: number = 1, limit: number = 10) {
        const skip = (page - 1) * limit;

        try {
            // Get all children of this parent
            const children = await this.prisma.studentProfile.findMany({
                where: {
                    schoolId: parentUser.schoolId,
                    parents: {
                        some: {
                            parent: {
                                userId: parentUser.id
                            }
                        }
                    }
                },
                select: { userId: true }
            });

            const childUserIds = children.map(c => c.userId);

            if (childUserIds.length === 0) {
                return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
            }

            const [data, total] = await this.prisma.$transaction([
                this.prisma.leaveRequest.findMany({
                    where: {
                        schoolId: parentUser.schoolId,
                        applicantId: { in: childUserIds }
                    },
                    include: {
                        leaveType: true,
                        attachments: true,
                        applicant: {
                            select: {
                                name: true,
                                studentProfile: {
                                    select: {
                                        rollNo: true,
                                        class: { select: { name: true } }
                                    }
                                }
                            }
                        },
                        approvedBy: { select: { name: true } },
                        classTeacherApprovedBy: { select: { name: true } }
                    },
                    orderBy: { createdAt: 'desc' },
                    skip,
                    take: limit
                }),
                this.prisma.leaveRequest.count({
                    where: {
                        schoolId: parentUser.schoolId,
                        applicantId: { in: childUserIds }
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
            this.handleError(error, 'Failed to retrieve leave requests');
        }
    }

    /**
     * Get specific leave request details
     */
    async findOne(parentUser: any, id: number) {
        try {
            const request = await this.prisma.leaveRequest.findFirst({
                where: {
                    id,
                    schoolId: parentUser.schoolId
                },
                include: {
                    leaveType: true,
                    attachments: true,
                    applicant: {
                        select: {
                            name: true,
                            studentProfile: {
                                select: {
                                    rollNo: true,
                                    class: { select: { name: true } }
                                }
                            }
                        }
                    },
                    approvedBy: { select: { name: true } },
                    classTeacherApprovedBy: { select: { name: true } }
                }
            });

            if (!request) {
                throw new NotFoundException('Leave request not found');
            }

            // Verify this leave belongs to parent's child
            const isParentChild = await this.prisma.studentProfile.findFirst({
                where: {
                    userId: request.applicantId,
                    schoolId: parentUser.schoolId,
                    parents: {
                        some: {
                            parent: {
                                userId: parentUser.id
                            }
                        }
                    }
                }
            });

            if (!isParentChild) {
                throw new ForbiddenException('You can only view leaves for your own children');
            }

            return request;
        } catch (error) {
            this.handleError(error, 'Failed to retrieve leave request');
        }
    }

    /**
     * Update pending leave request
     */
    async update(parentUser: any, id: number, dto: UpdateStudentLeaveDto) {
        try {
            const request = await this.findOne(parentUser, id);

            if (!request) {
                throw new NotFoundException('Leave request not found');
            }

            if (request.status !== LeaveStatus.PENDING && request.status !== LeaveStatus.PENDING_CLASS_TEACHER) {
                throw new BadRequestException('Only pending requests can be edited');
            }

            let daysCount = request.daysCount;
            if (dto.startDate || dto.endDate) {
                const startStr = dto.startDate || request.startDate.toISOString().split('T')[0];
                const endStr = dto.endDate || request.endDate.toISOString().split('T')[0];

                if (new Date(startStr) > new Date(endStr)) {
                    throw new BadRequestException('Start date cannot be after end date');
                }
                daysCount = await this.computeEffectiveDays(parentUser.schoolId, startStr, endStr);
            }

            const updateData: any = {
                ...dto,
                startDate: dto.startDate ? new Date(dto.startDate) : undefined,
                endDate: dto.endDate ? new Date(dto.endDate) : undefined,
                daysCount,
                studentId: undefined // Remove studentId from update
            };

            delete updateData.attachments;

            return await this.prisma.$transaction(async (tx) => {
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
        } catch (error) {
            this.handleError(error, 'Failed to update leave request');
        }
    }

    /**
     * Cancel pending leave request
     */
    async cancel(parentUser: any, id: number) {
        try {
            const request = await this.findOne(parentUser, id);

            if (!request) {
                throw new NotFoundException('Leave request not found');
            }

            if (request.status !== LeaveStatus.PENDING && request.status !== LeaveStatus.PENDING_CLASS_TEACHER) {
                throw new BadRequestException('Only pending requests can be cancelled');
            }

            return await this.prisma.leaveRequest.update({
                where: { id },
                data: { status: LeaveStatus.CANCELLED }
            });
        } catch (error) {
            this.handleError(error, 'Failed to cancel leave request');
        }
    }

    /**
     * Get available student leave types
     */
    async getLeaveTypes(schoolId: number) {
        try {
            return await this.prisma.leaveType.findMany({
                where: {
                    schoolId,
                    category: LeaveCategory.STUDENT,
                    isActive: true
                },
                select: {
                    id: true,
                    name: true,
                    code: true,
                    description: true,
                    color: true,
                    requiresDocument: true,
                    studentLeaveApprovalWorkflow: true
                }
            });
        } catch (error) {
            this.handleError(error, 'Failed to fetch leave types');
        }
    }

    /**
     * Get leave statistics for a specific student
     */
    async getStats(parentUser: any, studentId: number) {
        try {
            // Verify student belongs to parent
            const student = await this.prisma.studentProfile.findFirst({
                where: {
                    id: studentId,
                    schoolId: parentUser.schoolId,
                    parents: {
                        some: {
                            parent: {
                                userId: parentUser.id
                            }
                        }
                    }
                }
            });

            if (!student) {
                throw new ForbiddenException('You can only view statistics for your own children');
            }

            const allRequests = await this.prisma.leaveRequest.findMany({
                where: {
                    schoolId: parentUser.schoolId,
                    academicYearId: parentUser.academicYearId,
                    applicantId: student.userId
                },
                include: { leaveType: true }
            });

            const summary = {
                totalApplied: allRequests.length,
                approved: 0,
                pending: 0,
                pendingClassTeacher: 0,
                rejected: 0,
                totalDaysTaken: 0
            };

            const byTypeMap = new Map<number, any>();

            for (const req of allRequests) {
                if (req.status === LeaveStatus.APPROVED) {
                    summary.approved++;
                    summary.totalDaysTaken += req.daysCount;
                } else if (req.status === LeaveStatus.PENDING) {
                    summary.pending++;
                } else if (req.status === LeaveStatus.PENDING_CLASS_TEACHER) {
                    summary.pendingClassTeacher++;
                } else if (req.status === LeaveStatus.REJECTED) {
                    summary.rejected++;
                }

                if (!byTypeMap.has(req.leaveTypeId)) {
                    byTypeMap.set(req.leaveTypeId, {
                        typeId: req.leaveTypeId,
                        typeName: req.leaveType.name,
                        code: req.leaveType.code,
                        color: req.leaveType.color || '#3b82f6',
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

            return {
                summary,
                byType: Array.from(byTypeMap.values()),
                recentActivity: allRequests.slice(0, 5)
            };
        } catch (error) {
            this.handleError(error, 'Failed to fetch statistics');
        }
    }

    // --- Helpers ---

    private async computeEffectiveDays(schoolId: number, startStr: string | Date, endStr: string | Date): Promise<number> {
        const start = startStr instanceof Date ? startStr.toISOString().split('T')[0] : startStr;
        const end = endStr instanceof Date ? endStr.toISOString().split('T')[0] : endStr;

        const calendar = await this.calendarService.generateCalendar(schoolId, start, end);

        let count = 0;
        for (const day of calendar.days) {
            // Ensure we don't count holidays even if marked working by pattern (though CalendarService usually handles this)
            if (day.isWorking && day.type !== DayType.HOLIDAY) {
                count++;
            }
        }
        return count;
    }

    private handleError(error: any, context: string) {
        this.logger.error(`${context}: ${error.message}`, error.stack);
        if (error instanceof BadRequestException || error instanceof NotFoundException || error instanceof ForbiddenException) {
            throw error;
        }
        throw new BadRequestException('An unexpected error occurred. Please try again later.');
    }
}
