import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { LeaveStatus } from '@prisma/client';

export class LeaveActionDto {
    @IsEnum(LeaveStatus)
    @IsNotEmpty()
    status: LeaveStatus;

    @IsString()
    @IsOptional()
    rejectionReason?: string;
}
