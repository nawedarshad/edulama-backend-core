import { IsInt, IsNotEmpty, IsString, IsOptional, IsDateString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class LeaveAttachmentDto {
    @ApiProperty({ description: 'File URL', example: 'https://storage.example.com/file.pdf' })
    @IsString()
    @IsNotEmpty()
    fileUrl: string;

    @ApiPropertyOptional({ description: 'File name', example: 'medical_certificate.pdf' })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiPropertyOptional({ description: 'File MIME type', example: 'application/pdf' })
    @IsString()
    @IsOptional()
    type?: string;
}

export class ApplyStudentLeaveDto {
    @ApiPropertyOptional({ description: 'Student ID', example: 123 })
    @IsInt()
    @IsOptional()
    studentId?: number;

    @ApiProperty({ description: 'Leave type ID', example: 1 })
    @IsInt()
    @IsNotEmpty()
    leaveTypeId: number;

    @ApiProperty({ description: 'Leave start date (YYYY-MM-DD)', example: '2024-01-15' })
    @IsDateString()
    @IsNotEmpty()
    startDate: string;

    @ApiProperty({ description: 'Leave end date (YYYY-MM-DD)', example: '2024-01-17' })
    @IsDateString()
    @IsNotEmpty()
    endDate: string;

    @ApiProperty({ description: 'Reason for leave', example: 'Medical appointment' })
    @IsString()
    @IsNotEmpty()
    reason: string;

    @ApiPropertyOptional({ description: 'Attachments (e.g., medical certificates)', type: [LeaveAttachmentDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => LeaveAttachmentDto)
    @IsOptional()
    attachments?: LeaveAttachmentDto[];
}
