import { IsBoolean, IsEnum, IsInt, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DayOfWeek } from '@prisma/client';

export class CreateTimetableEntryDto {
    @ApiProperty()
    @IsInt()
    classId: number;

    @ApiProperty()
    @IsInt()
    sectionId: number;

    @ApiProperty()
    @IsInt()
    subjectId: number;

    @ApiProperty()
    @IsInt()
    teacherId: number;

    @ApiProperty({ enum: DayOfWeek })
    @IsEnum(DayOfWeek)
    day: DayOfWeek;

    @ApiProperty()
    @IsInt()
    periodId: number;

    @ApiPropertyOptional()
    @IsInt()
    @IsOptional()
    roomId?: number;

    @ApiPropertyOptional()
    @IsBoolean()
    @IsOptional()
    isFixed?: boolean;
}
