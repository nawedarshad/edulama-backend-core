import { IsInt, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DayOfWeek } from '@prisma/client';

export class MoveEntryDto {
    @ApiProperty({ description: 'Timetable entry ID to move' })
    @IsInt()
    entryId: number;

    @ApiProperty({ enum: DayOfWeek, description: 'Target day of week' })
    @IsEnum(DayOfWeek)
    targetDay: DayOfWeek;

    @ApiProperty({ description: 'Target period ID' })
    @IsInt()
    targetPeriodId: number;
}
