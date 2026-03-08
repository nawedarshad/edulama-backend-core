import { IsBoolean, IsEnum, IsInt, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DayOfWeek } from '@prisma/client';

export class CreateTimetableEntryDto {
    @ApiProperty()
    @IsInt()
    groupId: number;

    @ApiPropertyOptional()
    @IsInt()
    @IsOptional()
    subjectId?: number;

    @ApiPropertyOptional()
    @IsInt()
    @IsOptional()
    teacherId?: number;

    @ApiProperty({ enum: DayOfWeek })
    @IsEnum(DayOfWeek)
    day: DayOfWeek;

    @ApiProperty()
    @IsInt()
    timeSlotId: number;

    @ApiPropertyOptional()
    @IsInt()
    @IsOptional()
    roomId?: number;

    @ApiPropertyOptional()
    @IsBoolean()
    @IsOptional()
    isFixed?: boolean;
}
