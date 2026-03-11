import { IsArray, IsEnum, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HomeworkStatus } from '@prisma/client';
import { Type } from 'class-transformer';

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
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MarkSubmissionDto)
    submissions: MarkSubmissionDto[];
}
