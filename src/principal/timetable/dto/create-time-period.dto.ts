import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PeriodType } from '@prisma/client';

export class CreateTimePeriodDto {
    @ApiProperty()
    @IsNotEmpty()
    @IsString()
    name: string;

    @ApiProperty({ example: '09:00' })
    @IsNotEmpty()
    @IsString()
    @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
        message: 'startTime must be in HH:MM format',
    })
    startTime: string;

    @ApiProperty({ example: '09:45' })
    @IsNotEmpty()
    @IsString()
    @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
        message: 'endTime must be in HH:MM format',
    })
    endTime: string;

    @ApiProperty({ enum: PeriodType, default: PeriodType.TEACHING })
    @IsEnum(PeriodType)
    @IsOptional()
    type?: PeriodType;

    @ApiPropertyOptional({ description: 'Schedule ID this period belongs to' })
    @IsInt()
    @IsOptional()
    scheduleId?: number;

    @ApiPropertyOptional({ enum: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'], isArray: true })
    @IsOptional()
    days?: any[];
}
