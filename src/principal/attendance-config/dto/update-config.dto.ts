import { IsEnum, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';
import { AttendanceMode, AttendanceTrackingStrategy, DailyAttendanceAccess, LateMarkingResponsibility, LateAttendanceStatus } from '../attendance-enums';

export class UpdateAttendanceConfigDto {
    @IsNumber()
    @IsNotEmpty()
    academicYearId: number;

    @IsEnum(AttendanceMode)
    @IsNotEmpty()
    mode: AttendanceMode;

    @IsEnum(AttendanceTrackingStrategy)
    @IsNotEmpty()
    trackingStrategy: AttendanceTrackingStrategy;

    @IsEnum(LateMarkingResponsibility)
    @IsOptional()
    lateMarkingResponsibility?: LateMarkingResponsibility;

    @IsEnum(LateAttendanceStatus)
    @IsOptional()
    lateCountingPolicy?: LateAttendanceStatus;

    @IsEnum(DailyAttendanceAccess)
    @IsNotEmpty()
    responsibility: DailyAttendanceAccess;
}
