import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HomeworkStatus } from '@prisma/client';

export class MarkSubmissionDto {
    @ApiProperty()
    @IsInt()
    studentId: number;

    @ApiProperty({ enum: HomeworkStatus })
    @IsEnum(HomeworkStatus)
    status: HomeworkStatus;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    remarks?: string;
}

export class BulkMarkSubmissionDto {
    @ApiProperty({ type: [MarkSubmissionDto] })
    submissions: MarkSubmissionDto[];
}
