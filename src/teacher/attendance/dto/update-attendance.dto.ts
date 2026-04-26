import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { AttendanceStatus } from '@prisma/client';

export class UpdateStudentAttendanceDto {
    @IsNumber()
    @IsNotEmpty()
    studentProfileId: number;

    @IsEnum(AttendanceStatus)
    @IsOptional()
    status?: AttendanceStatus;

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

export class UpdateAttendanceDto {
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

    // We identify the session by date + context, or we could just pass sessionId if known.
    // Given the previous flow, Date is the consistent key.
    @IsString()
    @IsNotEmpty()
    date: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => UpdateStudentAttendanceDto)
    updates: UpdateStudentAttendanceDto[];
}
