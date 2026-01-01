import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { DayOfWeek } from '@prisma/client';

class CreateTimePeriodDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    startTime: string;

    @IsString()
    @IsNotEmpty()
    endTime: string;
}

export class CreateTimeSlotDto {
    @IsEnum(DayOfWeek)
    @IsNotEmpty()
    day: DayOfWeek;

    @IsInt()
    @IsNotEmpty()
    periodId: number;

    @IsString()
    @IsOptional()
    description?: string;

    @IsBoolean()
    @IsOptional()
    isBreak?: boolean;

    @IsOptional()
    @ValidateNested()
    @Type(() => CreateTimePeriodDto)
    period?: CreateTimePeriodDto;
}
