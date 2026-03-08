import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClassTeacherActionDto } from './dto/class-teacher-action.dto';
import { LeaveStatus } from '@prisma/client';
import { NotificationService } from '../../principal/global/notification/notification.service';
import { NotificationType } from '@prisma/client';

@Injectable()
export class StudentLeaveApprovalService {
    private readonly logger = new Logger(StudentLeaveApprovalService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly notificationService: NotificationService
    ) { }

    /**
     * Get all pending student leave requests for class teacher's class (section)
     */
    async findPendingLeaves(teacherUser: any, page: number = 1, limit: number = 10) {
        const skip = (page - 1) * limit;

        try {
            // Find teacher profile
            const teacherProfile = await this.prisma.teacherProfile.findUnique({
                where: { userId: teacherUser.id }
            });

            if (!teacherProfile) {
                throw new NotFoundException('Teacher profile not found');
            }

            // Find academic assignments for this teacher
            const assignments = await this.prisma.academicAssignment.findMany({
                where: {
                    teacherId: teacherProfile.id,
                    schoolId: teacherUser.schoolId,
                    role: { in: ['CLASS_TEACHER', 'HEAD_TEACHER', 'COORDINATOR', 'MENTOR'] }
                },
                include: {
                    class: { include: { sections: { select: { id: true } } } }
                }
            });

            if (assignments.length === 0) {
                return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
            }

            const sectionIdsSet = new Set<number>();
            for (const assignment of assignments) {
                if (assignment.sectionId) {
                    sectionIdsSet.add(assignment.sectionId);
                } else if (assignment.class) {
                    assignment.class.sections.forEach(s => sectionIdsSet.add(s.id));
                }
            }

            const sectionIds = Array.from(sectionIdsSet);

            // Get students in these sections
            const students = await this.prisma.studentProfile.findMany({
                where: {
                    schoolId: teacherUser.schoolId,
                    sectionId: { in: sectionIds }
                },
                select: { userId: true }
            });

            const studentUserIds = students.map(s => s.userId).filter((id): id is number => id !== null);

            if (studentUserIds.length === 0) {
                return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
            }

            // Get pending leave requests for these students
            const [data, total] = await this.prisma.$transaction([
                this.prisma.leaveRequest.findMany({
                    where: {
                        schoolId: teacherUser.schoolId,
                        applicantId: { in: studentUserIds },
                        status: LeaveStatus.PENDING_CLASS_TEACHER
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
                                        class: { select: { name: true } },
                                        section: { select: { name: true } }
                                    }
                                }
                            }
                        }
                    },
                    orderBy: { createdAt: 'asc' },
                    skip,
                    take: limit
                }),
                this.prisma.leaveRequest.count({
                    where: {
                        schoolId: teacherUser.schoolId,
                        applicantId: { in: studentUserIds },
                        status: LeaveStatus.PENDING_CLASS_TEACHER
                    }
                })
            ]);

            this.logger.log(`Found ${total} pending leaves for section teacher ${teacherProfile.id}`);
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
            this.handleError(error, 'Failed to fetch pending leaves');
        }
    }

    /**
     * Get history of leaves processed by class teacher
     */
    async findHistory(teacherUser: any, page: number = 1, limit: number = 10) {
        const skip = (page - 1) * limit;

        try {
            const [data, total] = await this.prisma.$transaction([
                this.prisma.leaveRequest.findMany({
                    where: {
                        schoolId: teacherUser.schoolId,
                        classTeacherApprovedById: teacherUser.id
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
                                        class: { select: { name: true } },
                                        section: { select: { name: true } }
                                    }
                                }
                            }
                        }
                    },
                    orderBy: { classTeacherActionAt: 'desc' },
                    skip,
                    take: limit
                }),
                this.prisma.leaveRequest.count({
                    where: {
                        schoolId: teacherUser.schoolId,
                        classTeacherApprovedById: teacherUser.id
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
            this.handleError(error, 'Failed to fetch leave history');
        }
    }

    /**
     * Get specific leave request details
     */
    async findOne(teacherUser: any, id: number) {
        try {
            const request = await this.prisma.leaveRequest.findFirst({
                where: {
                    id,
                    schoolId: teacherUser.schoolId,
                    status: LeaveStatus.PENDING_CLASS_TEACHER
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
                                    classId: true,
                                    sectionId: true,
                                    class: { select: { name: true } },
                                    section: {
                                        select: {
                                            name: true,
                                            id: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            if (!request) {
                throw new NotFoundException('Leave request not found or not pending class teacher approval');
            }

            // Verify teacher is the section teacher for this student
            const teacherProfile = await this.prisma.teacherProfile.findUnique({
                where: { userId: teacherUser.id }
            });

            if (!teacherProfile) {
                throw new ForbiddenException('Teacher profile not found');
            }

            const studentSectionId = request.applicant?.studentProfile?.sectionId;
            const studentClassId = request.applicant?.studentProfile?.classId;

            if (!studentSectionId || !studentClassId) {
                throw new BadRequestException('Student profile is incomplete');
            }

            const assignment = await this.prisma.academicAssignment.findFirst({
                where: {
                    teacherId: teacherProfile.id,
                    schoolId: teacherUser.schoolId,
                    role: { in: ['CLASS_TEACHER', 'HEAD_TEACHER', 'COORDINATOR', 'MENTOR'] },
                    OR: [
                        { sectionId: studentSectionId },
                        { classId: studentClassId, sectionId: null }
                    ]
                }
            });

            if (!assignment) {
                throw new ForbiddenException('You are not authorized to approve leave for this student');
            }

            return request;
        } catch (error) {
            this.handleError(error, 'Failed to fetch leave request');
        }
    }

    /**
     * Approve or reject student leave request
     */
    async takeAction(teacherUser: any, id: number, dto: ClassTeacherActionDto) {
        try {
            // findOne performs the security check
            await this.findOne(teacherUser, id);

            const actionAt = new Date(); // Capture strict timestamp

            this.logger.log(`Teacher ${teacherUser.id} taking action on leave ${id}: ${dto.status}`);

            const updated = await this.prisma.leaveRequest.update({
                where: { id },
                data: {
                    status: dto.status,
                    classTeacherApprovedById: teacherUser.id,
                    classTeacherActionAt: actionAt,
                    classTeacherRemarks: dto.remarks
                },
                include: {
                    leaveType: true,
                    applicant: {
                        select: {
                            name: true,
                            studentProfile: {
                                select: {
                                    rollNo: true,
                                    class: { select: { name: true } },
                                    section: { select: { name: true } }
                                }
                            }
                        }
                    }
                }
            });

            const actionText = dto.status === LeaveStatus.PENDING ? 'approved and forwarded to principal' : 'rejected';

            const response = {
                ...updated,
                _meta: {
                    message: `Leave request ${actionText}`,
                    nextStep: dto.status === LeaveStatus.PENDING ? 'Awaiting principal approval' : 'Workflow complete'
                }
            };

            // Send Notification to Applicant
            const msg = dto.status === LeaveStatus.PENDING
                ? 'Your leave request has been approved by your Class Teacher and forwarded to Principal.'
                : `Your leave request has been rejected by your Class Teacher. Remarks: ${dto.remarks || 'None'}`;

            this.notificationService.create(teacherUser.schoolId, teacherUser.id, {
                title: 'Leave Request Update',
                message: msg,
                type: NotificationType.ATTENDANCE,
                targetUserIds: [updated.applicantId]
            }).catch(err => this.logger.error('Failed to send notification', err));

            return response;
        } catch (error) {
            this.handleError(error, 'Failed to process leave action');
        }
    }

    /**
     * Get approval statistics for class teacher
     */
    async getStats(teacherUser: any) {
        try {
            const teacherProfile = await this.prisma.teacherProfile.findUnique({
                where: { userId: teacherUser.id }
            });

            if (!teacherProfile) {
                throw new NotFoundException('Teacher profile not found');
            }

            // Find academic assignments
            const assignments = await this.prisma.academicAssignment.findMany({
                where: {
                    teacherId: teacherProfile.id,
                    schoolId: teacherUser.schoolId,
                    role: { in: ['CLASS_TEACHER', 'HEAD_TEACHER', 'COORDINATOR', 'MENTOR'] }
                },
                include: {
                    class: { include: { sections: { select: { id: true } } } }
                }
            });

            const sectionIdsSet = new Set<number>();
            for (const assignment of assignments) {
                if (assignment.sectionId) {
                    sectionIdsSet.add(assignment.sectionId);
                } else if (assignment.class) {
                    assignment.class.sections.forEach(s => sectionIdsSet.add(s.id));
                }
            }

            const sectionIds = Array.from(sectionIdsSet);

            // Get students
            const students = await this.prisma.studentProfile.findMany({
                where: {
                    schoolId: teacherUser.schoolId,
                    sectionId: { in: sectionIds }
                },
                select: { userId: true }
            });

            const studentUserIds = students.map(s => s.userId).filter((id): id is number => id !== null);

            if (studentUserIds.length === 0) {
                return {
                    pending: 0,
                    approvedByMe: 0,
                    rejectedByMe: 0,
                    totalStudents: 0
                };
            }

            const [pending, approved, rejected] = await Promise.all([
                this.prisma.leaveRequest.count({
                    where: {
                        schoolId: teacherUser.schoolId,
                        applicantId: { in: studentUserIds },
                        status: LeaveStatus.PENDING_CLASS_TEACHER
                    }
                }),
                this.prisma.leaveRequest.count({
                    where: {
                        schoolId: teacherUser.schoolId,
                        applicantId: { in: studentUserIds },
                        classTeacherApprovedById: teacherUser.id,
                        status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] }
                    }
                }),
                this.prisma.leaveRequest.count({
                    where: {
                        schoolId: teacherUser.schoolId,
                        applicantId: { in: studentUserIds },
                        classTeacherApprovedById: teacherUser.id,
                        status: LeaveStatus.REJECTED
                    }
                })
            ]);

            return {
                pending,
                approvedByMe: approved,
                rejectedByMe: rejected,
                totalStudents: students.length
            };
        } catch (error) {
            this.handleError(error, 'Failed to fetch statistics');
        }
    }

    // --- Helpers ---

    private handleError(error: any, context: string) {
        this.logger.error(`${context}: ${error.message}`, error.stack);
        if (error instanceof BadRequestException || error instanceof NotFoundException || error instanceof ForbiddenException) {
            throw error;
        }
        throw new BadRequestException('An unexpected error occurred. Please try again later.');
    }
}
