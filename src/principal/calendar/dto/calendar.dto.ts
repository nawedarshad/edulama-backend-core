import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, IsDateString, IsArray, ValidateNested, IsInt, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { DayOfWeek, DayType } from '@prisma/client';

class DayConfigDto {
    @IsEnum(DayOfWeek)
    dayOfWeek: DayOfWeek;

    @IsBoolean()
    isWorking: boolean;
}

export class SetWorkingPatternDto {
    @IsInt()
    @IsNotEmpty()
    academicYearId: number;

    @IsArray()
    @ArrayMinSize(7, { message: 'All 7 days must be configured.' })
    @ArrayMaxSize(7, { message: 'All 7 days must be configured.' })
    @ValidateNested({ each: true })
    @Type(() => DayConfigDto)
    days: DayConfigDto[];
}

export class GetCalendarDto {
    @IsDateString()
    @IsNotEmpty()
    startDate: string;

    @IsDateString()
    @IsNotEmpty()
    endDate: string;

    @IsInt()
    @IsOptional()
    classId?: number;
}

export class CreateCalendarExceptionDto {
    @IsInt()
    @IsNotEmpty()
    academicYearId: number;

    @IsDateString()
    @IsNotEmpty()
    date: string;

    @IsEnum(DayType)
    @IsNotEmpty()
    type: DayType;

    @IsString()
    @IsOptional()
    title?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsInt()
    @IsOptional()
    classId?: number;
}

export class UpdateCalendarExceptionDto {
    @IsDateString()
    @IsOptional()
    date?: string;

    @IsEnum(DayType)
    @IsOptional()
    type?: DayType;

    @IsString()
    @IsOptional()
    title?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsInt()
    @IsOptional()
    classId?: number;
}

export interface CalendarDay {
    date: string;
    dayOfWeek: number;
    type: DayType;
    isWorking: boolean;
    title?: string;
    academicYearId: number;
}

export interface CalendarResponse {
    days: CalendarDay[];
    meta: any;
}


export class CloneCalendarDto {
    @IsInt()
    @IsNotEmpty()
    sourceYearId: number;

    @IsInt()
    @IsNotEmpty()
    targetYearId: number;

    @IsBoolean()
    @IsOptional()
    copyExceptions?: boolean;

    @IsBoolean()
    @IsOptional()
    copyPatterns?: boolean;
}
