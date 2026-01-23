import { IsInt, IsOptional, IsISO8601, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PrincipalDiaryQueryDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Min(1)
    @Type(() => Number)
    page?: number = 1;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Min(1)
    @Type(() => Number)
    limit?: number = 10;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Type(() => Number)
    teacherId?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Type(() => Number)
    classId?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Type(() => Number)
    sectionId?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Type(() => Number)
    subjectId?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Type(() => Number)
    academicYearId?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsISO8601()
    date?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsISO8601()
    startDate?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsISO8601()
    endDate?: string;
}
