import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAttendanceSessionDto {
    @ApiProperty({ description: 'Academic Group ID' })
    @IsInt()
    @Min(1)
    groupId: number;

    @ApiPropertyOptional({ description: 'Class ID' })
    @IsOptional()
    @IsInt()
    @Min(1)
    classId?: number;

    @ApiPropertyOptional({ description: 'Section ID' })
    @IsOptional()
    @IsInt()
    @Min(1)
    sectionId?: number;

    @ApiPropertyOptional({ description: 'Subject ID. Required if Attendance Mode is PERIOD_WISE.' })
    @IsOptional()
    @IsInt()
    @Min(1)
    subjectId?: number;

    @ApiPropertyOptional({ description: 'Time Slot ID. Required if Attendance Mode is PERIOD_WISE.' })
    @IsOptional()
    @IsInt()
    @Min(1)
    timeSlotId?: number;

    @ApiPropertyOptional({ description: 'Legacy Period ID' })
    @IsOptional()
    @IsInt()
    @Min(1)
    periodId?: number;

    @ApiProperty({ description: 'Date of attendance (ISO8601)' })
    @IsDateString()
    date: string;
}
