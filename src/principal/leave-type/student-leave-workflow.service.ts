import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateStudentLeaveWorkflowDto } from './dto/update-student-leave-workflow.dto';
import { LeaveCategory } from '@prisma/client';

@Injectable()
export class StudentLeaveWorkflowService {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * Get all student leave types with their workflow settings
     */
    async getAllStudentLeaveWorkflows(schoolId: number) {
        return this.prisma.leaveType.findMany({
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
                studentLeaveApprovalWorkflow: true,
                requiresDocument: true
            },
            orderBy: { name: 'asc' }
        });
    }

    /**
     * Get workflow setting for a specific student leave type
     */
    async getWorkflowForLeaveType(schoolId: number, leaveTypeId: number) {
        const leaveType = await this.prisma.leaveType.findFirst({
            where: {
                id: leaveTypeId,
                schoolId,
                category: LeaveCategory.STUDENT
            },
            select: {
                id: true,
                name: true,
                code: true,
                studentLeaveApprovalWorkflow: true
            }
        });

        if (!leaveType) {
            throw new NotFoundException('Student leave type not found');
        }

        return leaveType;
    }

    /**
     * Update workflow setting for a specific student leave type
     */
    async updateWorkflow(schoolId: number, leaveTypeId: number, dto: UpdateStudentLeaveWorkflowDto) {
        // Verify leave type exists and is a student leave type
        const leaveType = await this.prisma.leaveType.findFirst({
            where: {
                id: leaveTypeId,
                schoolId
            }
        });

        if (!leaveType) {
            throw new NotFoundException('Leave type not found');
        }

        if (leaveType.category !== LeaveCategory.STUDENT) {
            throw new BadRequestException('Workflow settings only apply to student leave types');
        }

        // Update the workflow
        return this.prisma.leaveType.update({
            where: { id: leaveTypeId },
            data: {
                studentLeaveApprovalWorkflow: dto.studentLeaveApprovalWorkflow
            },
            select: {
                id: true,
                name: true,
                code: true,
                category: true,
                studentLeaveApprovalWorkflow: true
            }
        });
    }

    /**
     * Bulk update workflows for multiple leave types
     */
    async bulkUpdateWorkflows(schoolId: number, updates: Array<{ leaveTypeId: number; workflow: string }>) {
        const results: Array<{
            success: boolean;
            leaveTypeId: number;
            data?: any;
            error?: string;
        }> = [];

        for (const update of updates) {
            try {
                const result = await this.updateWorkflow(
                    schoolId,
                    update.leaveTypeId,
                    { studentLeaveApprovalWorkflow: update.workflow as any }
                );
                results.push({ success: true, leaveTypeId: update.leaveTypeId, data: result });
            } catch (error) {
                results.push({
                    success: false,
                    leaveTypeId: update.leaveTypeId,
                    error: error.message
                });
            }
        }

        return {
            total: updates.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results
        };
    }
}
