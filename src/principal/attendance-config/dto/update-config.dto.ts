import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AttendanceMode, AttendanceTrackingStrategy, DailyAttendanceAccess, LateMarkingResponsibility, LateAttendanceStatus } from '../attendance-enums';

export class UpdateAttendanceConfigDto {
    @IsNumber()
    @IsNotEmpty()
    @Type(() => Number)
    academicYearId: number;

    @IsEnum(AttendanceMode)
    @IsNotEmpty()
    mode: AttendanceMode;

    @IsEnum(DailyAttendanceAccess)
    @IsNotEmpty()
    responsibility: DailyAttendanceAccess;

    @IsEnum(AttendanceTrackingStrategy)
    @IsNotEmpty()
    trackingStrategy: AttendanceTrackingStrategy;

    @IsEnum(LateMarkingResponsibility)
    @IsOptional()
    lateMarkingResponsibility?: LateMarkingResponsibility;

    @IsEnum(LateAttendanceStatus)
    @IsOptional()
    lateCountingPolicy?: LateAttendanceStatus;

    @IsInt()
    @IsOptional()
    @Min(0)
    @Type(() => Number)
    lateMarkThreshold?: number;

    @IsInt()
    @IsOptional()
    @Min(1)
    @Type(() => Number)
    absentAfter?: number;
}
