import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { LeaveStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ClassTeacherActionDto {
    @ApiProperty({
        enum: [LeaveStatus.PENDING, LeaveStatus.REJECTED],
        description: 'Action to take: PENDING (approve/forward to principal) or REJECTED',
        example: LeaveStatus.PENDING
    })
    @IsEnum([LeaveStatus.PENDING, LeaveStatus.REJECTED])
    @IsNotEmpty()
    status: LeaveStatus;

    @ApiPropertyOptional({ description: 'Remarks or recommendations', example: 'Approved. Student has valid reason.' })
    @IsString()
    @IsOptional()
    remarks?: string;
}
