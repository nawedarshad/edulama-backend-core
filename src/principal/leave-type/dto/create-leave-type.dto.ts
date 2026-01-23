import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { LeaveCategory, StudentLeaveApprovalWorkflow } from '@prisma/client';

export class CreateLeaveTypeDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    code: string;

    @IsEnum(LeaveCategory)
    @IsNotEmpty()
    category: LeaveCategory;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsOptional()
    color?: string;

    @IsBoolean()
    @IsOptional()
    requiresDocument?: boolean;

    @IsBoolean()
    @IsOptional()
    isActive?: boolean;

    // Student Leave Approval Workflow (only applicable for STUDENT category)
    @IsEnum(StudentLeaveApprovalWorkflow)
    @IsOptional()
    studentLeaveApprovalWorkflow?: StudentLeaveApprovalWorkflow;
}
