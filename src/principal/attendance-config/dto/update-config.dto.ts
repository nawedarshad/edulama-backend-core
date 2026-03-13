import { IsEnum, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { AttendanceMode, AttendanceTrackingStrategy, DailyAttendanceAccess, LateMarkingResponsibility, LateAttendanceStatus } from '../attendance-enums';

export class UpdateAttendanceConfigDto {
    @IsNumber()
    @IsNotEmpty()
    academicYearId: number;

    @IsEnum(AttendanceMode)
    @IsNotEmpty()
    mode: AttendanceMode;

    @Transform(({ value }) => {
        // Map old frontend values to the new default 'SIMPLE'
        if (['ONLY_ATTENDANCE', 'ATTENDANCE_AND_LATE_SEPARATE', 'LATE_IN_ATTENDANCE'].includes(value)) {
            return AttendanceTrackingStrategy.SIMPLE;
        }
        return value;
    })
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
