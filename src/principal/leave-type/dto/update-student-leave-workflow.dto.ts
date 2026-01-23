import { IsEnum, IsNotEmpty } from 'class-validator';
import { StudentLeaveApprovalWorkflow } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateStudentLeaveWorkflowDto {
    @ApiProperty({
        enum: StudentLeaveApprovalWorkflow,
        description: 'Student leave approval workflow for this leave type',
        example: StudentLeaveApprovalWorkflow.CLASS_TEACHER_FIRST
    })
    @IsEnum(StudentLeaveApprovalWorkflow)
    @IsNotEmpty()
    studentLeaveApprovalWorkflow: StudentLeaveApprovalWorkflow;
}
