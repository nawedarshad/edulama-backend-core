import { IsInt, IsOptional, IsISO8601 } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ClassDiaryQueryDto {
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

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    classId?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    subjectId?: number;
}
