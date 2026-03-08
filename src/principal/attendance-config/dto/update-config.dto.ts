import { IsEnum, IsNotEmpty, IsNumber } from 'class-validator';
import { AttendanceMode, DailyAttendanceAccess } from '@prisma/client';

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
}
