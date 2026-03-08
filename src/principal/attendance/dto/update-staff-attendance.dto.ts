import { IsArray, IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum AttendanceStatus {
    PRESENT = 'PRESENT',
    ABSENT = 'ABSENT',
    EXCUSED = 'EXCUSED',
    LATE = 'LATE',
    SUSPENDED = 'SUSPENDED'
}

export class StaffAttendanceUpdateItemDto {
    @IsNotEmpty()
    @IsNumber()
    teacherId: number;

    @IsNotEmpty()
    @IsEnum(AttendanceStatus)
    status: AttendanceStatus;

    @IsOptional()
    @IsString()
    remarks?: string;

    @IsOptional()
    @IsString()
    checkInTime?: string; // ISO Date string if needed, or HH:mm

    @IsOptional()
    @IsString()
    checkOutTime?: string;
}

export class UpdateStaffAttendanceDto {
    @IsNotEmpty()
    @IsDateString()
    date: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => StaffAttendanceUpdateItemDto)
    updates: StaffAttendanceUpdateItemDto[];
}

