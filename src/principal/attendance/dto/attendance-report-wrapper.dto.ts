import { IsDateString, IsOptional, IsNumber, IsNotEmpty, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AttendanceReportFilterDto {
    @IsDateString()
    @IsOptional()
    date?: string;

    @IsDateString()
    @IsOptional()
    startDate?: string;

    @IsDateString()
    @IsOptional()
    endDate?: string;

    @IsNumber()
    @Type(() => Number)
    @IsNotEmpty()
    academicYearId: number;

    @IsNumber()
    @Type(() => Number)
    @IsOptional()
    classId?: number;

    @IsNumber()
    @Type(() => Number)
    @IsOptional()
    sectionId?: number;

    @IsNumber()
    @Type(() => Number)
    @IsOptional()
    @Min(1)
    limit?: number;

    @IsOptional()
    scope?: string;
}
