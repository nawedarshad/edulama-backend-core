import { IsArray, IsBoolean, IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class StudentAttendanceRecord {
    @ApiProperty({ description: 'Student Profile ID' })
    @IsInt()
    @Min(1)
    studentId: number;

    @ApiProperty({ description: 'Status: PRESENT, ABSENT, LATE, etc.' })
    @IsString()
    @IsNotEmpty()
    status: string; // We'll validate against enum in service or use IsEnum if we import it

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    isLate?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    remarks?: string;
}

export class SubmitAttendanceDto {
    @ApiProperty({ description: 'Class ID' })
    @IsInt()
    @Min(1)
    classId: number;

    @ApiProperty({ description: 'Section ID' })
    @IsInt()
    @Min(1)
    sectionId: number;

    @ApiPropertyOptional({ description: 'Subject ID (Required if Period-wise)' })
    @IsOptional()
    @IsInt()
    subjectId?: number;

    @ApiPropertyOptional({ description: 'Period ID (Required if Period-wise)' })
    @IsOptional()
    @IsInt()
    periodId?: number;

    @ApiProperty({ description: 'Date of attendance' })
    @IsDateString()
    date: string;

    @ApiProperty({ type: [StudentAttendanceRecord] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => StudentAttendanceRecord)
    records: StudentAttendanceRecord[];
}
