import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAttendanceSessionDto {
    @ApiProperty({ description: 'Class ID' })
    @IsInt()
    @Min(1)
    classId: number;

    @ApiProperty({ description: 'Section ID' })
    @IsInt()
    @Min(1)
    sectionId: number;

    @ApiPropertyOptional({ description: 'Subject ID. Required if Attendance Mode is PERIOD_WISE.' })
    @IsOptional()
    @IsInt()
    @Min(1)
    subjectId?: number;

    @ApiPropertyOptional({ description: 'Period ID (TimeSlot or Period). Required if Attendance Mode is PERIOD_WISE.' })
    @IsOptional()
    @IsInt()
    @Min(1)
    periodId?: number;

    @ApiProperty({ description: 'Date of attendance (ISO8601)' })
    @IsDateString()
    date: string;
}
