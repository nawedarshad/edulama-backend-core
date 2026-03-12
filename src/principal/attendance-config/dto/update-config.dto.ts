import { AttendanceMode, DailyAttendanceAccess, AttendanceTrackingStrategy } from '@prisma/client';

export class UpdateAttendanceConfigDto {
    @IsNumber()
    @IsNotEmpty()
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
}
