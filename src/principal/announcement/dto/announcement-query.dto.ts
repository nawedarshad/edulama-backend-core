import { AnnouncementType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class AnnouncementQueryDto {
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
    @IsEnum(AnnouncementType)
    type?: AnnouncementType;

    @IsOptional()
    @IsString()
    startDate?: string;

    @IsOptional()
    @IsString()
    endDate?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    academicYearId?: number;

    @IsOptional()
    @IsString()
    priority?: string;

    @IsOptional()
    @IsString()
    unread?: string; // 'true' or 'false'
}
