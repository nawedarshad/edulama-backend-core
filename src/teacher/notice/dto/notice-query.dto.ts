import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { NoticeType } from '@prisma/client';

export class NoticeQueryDto {
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

    @IsOptional()
    @IsInt()
    @Type(() => Number)
    classId?: number;

    @IsOptional()
    @IsInt()
    @Type(() => Number)
    subjectId?: number;
}
