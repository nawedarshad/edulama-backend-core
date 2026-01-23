import { IsInt, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SwapEntriesDto {
    @ApiProperty({ description: 'First timetable entry ID' })
    @IsInt()
    entryId1: number;

    @ApiProperty({ description: 'Second timetable entry ID' })
    @IsInt()
    entryId2: number;
}
