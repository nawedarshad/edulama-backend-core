import { ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceMode, DailyAttendanceAccess } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateAttendanceSettingsDto {
    @ApiPropertyOptional({ enum: AttendanceMode, description: 'Attendance tracking mode', example: AttendanceMode.DAILY })
    @IsOptional()
    @IsEnum(AttendanceMode)
    attendanceMode?: AttendanceMode;

    @ApiPropertyOptional({ description: 'Minutes after which a student is marked late', example: 15 })
    @IsOptional()
    @IsInt()
    @Min(0)
    lateMarkThreshold?: number;

    @ApiPropertyOptional({ description: 'Days of consecutive absence before flagging', example: 3 })
    @IsOptional()
    @IsInt()
    @Min(1)
    absentAfter?: number;

    @ApiPropertyOptional({ description: 'Allow parents/students to submit excuse notes', example: true })
    @IsOptional()
    @IsBoolean()
    allowExcuseSubmission?: boolean;

    @ApiPropertyOptional({ enum: DailyAttendanceAccess, description: 'Who can take daily attendance', example: DailyAttendanceAccess.CLASS_TEACHER })
    @IsEnum(DailyAttendanceAccess)
    @IsOptional()
    dailyAttendanceAccess?: DailyAttendanceAccess;
}
