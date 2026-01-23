import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { NoticeType } from '@prisma/client';

export class PrincipalNoticeQueryDto {
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
    sectionId?: number;

    @IsOptional()
    @IsInt()
    @Type(() => Number)
    teacherId?: number; // TeacherProfileId

    @IsOptional()
    @Type(() => Date)
    startDate?: Date;

    @IsOptional()
    @Type(() => Date)
    endDate?: Date;
}
