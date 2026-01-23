import { IsDateString, IsNotEmpty, IsOptional, IsString, IsArray, ValidateNested, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class LeaveAttachmentDto {
    @IsString()
    @IsNotEmpty()
    fileUrl: string;

    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    type?: string;
}

export class ApplyLeaveDto {
    @IsInt()
    @IsNotEmpty()
    leaveTypeId: number;

    @IsDateString()
    @IsNotEmpty()
    startDate: string;

    @IsDateString()
    @IsNotEmpty()
    endDate: string;

    @IsString()
    @IsNotEmpty()
    reason: string;

    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => LeaveAttachmentDto)
    attachments?: LeaveAttachmentDto[];
}
