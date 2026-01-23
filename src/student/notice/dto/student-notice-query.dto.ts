import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { NoticeType } from '@prisma/client';

export class StudentNoticeQueryDto {
    @IsOptional()
    @IsInt()
    @Min(1)
    @Type(() => Number)
    page?: number = 1;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Type(() => Number)
    limit?: number = 10;

    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsEnum(NoticeType)
    type?: NoticeType;

    // Student can filter by subject ID if they want to see notices for a specific subject
    @IsOptional()
    @IsInt()
    @Type(() => Number)
    subjectId?: number;
}
