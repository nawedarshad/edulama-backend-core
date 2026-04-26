import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { AttendanceStatus } from '@prisma/client';

export class StudentAttendanceDto {
    @IsNumber()
    @IsOptional()
    studentProfileId?: number;

    @IsNumber()
    @IsOptional()
    userId?: number;

    @IsEnum(AttendanceStatus)
    @IsNotEmpty()
    status: AttendanceStatus;

    @IsString()
    @IsOptional()
    remarks?: string;

    @IsBoolean()
    @IsOptional()
    isLate?: boolean;

    @IsString()
    @IsOptional()
    lateReason?: string;
}

export class TakeAttendanceDto {
    @IsNumber()
    @IsNotEmpty()
    academicYearId: number;

    @IsNumber()
    @IsNotEmpty()
    classId: number;

    @IsNumber()
    @IsNotEmpty()
    sectionId: number;

    @IsNumber()
    @IsOptional()
    subjectId?: number;

    @IsNumber()
    @IsOptional()
    timePeriodId?: number;

    @IsDateString()
    @IsNotEmpty()
    date: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => StudentAttendanceDto)
    attendances: StudentAttendanceDto[];
}
