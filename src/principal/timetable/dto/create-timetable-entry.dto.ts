import { IsBoolean, IsEnum, IsInt, IsOptional, IsArray, Min, Max } from 'class-validator';
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

    @ApiPropertyOptional({ description: 'Primary teacher ID (legacy/mobile support)' })
    @IsInt()
    @IsOptional()
    teacherId?: number;

    @ApiPropertyOptional({ type: [Number], description: 'Additional/Multiple teacher IDs' })
    @IsArray()
    @IsInt({ each: true })
    @IsOptional()
    teacherIds?: number[];

    @ApiProperty({ enum: DayOfWeek })
    @IsEnum(DayOfWeek)
    day: DayOfWeek;

    @ApiProperty()
    @IsInt()
    timeSlotId: number;

    @ApiPropertyOptional({ description: 'Number of consecutive slots this entry occupies', default: 1 })
    @IsInt()
    @Min(1)
    @Max(4)
    @IsOptional()
    durationSlots?: number = 1;

    @ApiPropertyOptional({ description: 'Primary room ID (legacy/mobile support)' })
    @IsInt()
    @IsOptional()
    roomId?: number;

    @ApiPropertyOptional({ type: [Number], description: 'Additional/Multiple room IDs' })
    @IsArray()
    @IsInt({ each: true })
    @IsOptional()
    roomIds?: number[];

    @ApiPropertyOptional()
    @IsBoolean()
    @IsOptional()
    isFixed?: boolean;
}
