import { IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsOptional, IsPhoneNumber, IsString, IsUrl, Min } from 'class-validator';
import { AttendanceMode, DailyAttendanceAccess, GradingSystem, PromotionPolicy } from '@prisma/client';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSchoolSettingsDto {
    // Branding
    @ApiPropertyOptional({ description: 'School motto displayed on dashboard', example: 'Excellence in Education' })
    @IsString()
    @IsOptional()
    @Transform(({ value }) => value === "" ? null : value)
    motto?: string;

    @ApiPropertyOptional({ description: 'URL for the login page background image', example: 'https://example.com/bg.jpg' })
    @IsUrl()
    @IsOptional()
    @Transform(({ value }) => value === "" ? null : value)
    backgroundImageUrl?: string;

    @ApiPropertyOptional({ description: 'URL for the school logo', example: 'https://example.com/logo.png' })
    @IsUrl()
    @IsOptional()
    @Transform(({ value }) => value === "" ? null : value)
    logoUrl?: string;

    @ApiPropertyOptional({ description: 'URL for the browser favicon', example: 'https://example.com/favicon.ico' })
    @IsUrl()
    @IsOptional()
    @Transform(({ value }) => value === "" ? null : value)
    faviconUrl?: string;

    // Address
    @ApiPropertyOptional({ description: 'Street address line 1', example: '123 Education Lane' })
    @IsString()
    @IsOptional()
    @Transform(({ value }) => value === "" ? null : value)
    street?: string;

    @ApiPropertyOptional({ description: 'City or District', example: 'New York' })
    @IsString()
    @IsOptional()
    @Transform(({ value }) => value === "" ? null : value)
    city?: string;

    @ApiPropertyOptional({ description: 'State or Province', example: 'NY' })
    @IsString()
    @IsOptional()
    @Transform(({ value }) => value === "" ? null : value)
    state?: string;

    @ApiPropertyOptional({ description: 'Postal/Zip Code', example: '10001' })
    @IsString()
    @IsOptional()
    @Transform(({ value }) => value === "" ? null : value)
    zipCode?: string;

    @ApiPropertyOptional({ description: 'Country Name', example: 'USA' })
    @IsString()
    @IsOptional()
    @Transform(({ value }) => value === "" ? null : value)
    country?: string;

    // Contact
    @ApiPropertyOptional({ description: 'Official contact phone number', example: '+1-555-0199' })
    @IsString()
    @IsOptional()
    @Transform(({ value }) => value === "" ? null : value)
    phone?: string;

    @ApiPropertyOptional({ description: 'Official support email', example: 'contact@school.edu' })
    @IsEmail()
    @IsOptional()
    @Transform(({ value }) => value === "" ? null : value)
    email?: string;

    @ApiPropertyOptional({ description: 'Official website URL', example: 'https://school.edu' })
    @IsUrl()
    @IsOptional()
    @Transform(({ value }) => value === "" ? null : value)
    website?: string;

    // Academic
    @ApiPropertyOptional({ enum: AttendanceMode, description: 'Attendance tracking mode', example: AttendanceMode.DAILY })
    @IsEnum(AttendanceMode)
    @IsOptional()
    @Transform(({ value }) => value === "" ? undefined : value)
    attendanceMode?: AttendanceMode;

    @ApiPropertyOptional({ enum: DailyAttendanceAccess, description: 'Who can take daily attendance', example: DailyAttendanceAccess.CLASS_TEACHER })
    @IsEnum(DailyAttendanceAccess)
    @IsOptional()
    @Transform(({ value }) => value === "" ? undefined : value)
    dailyAttendanceAccess?: DailyAttendanceAccess;

    @ApiPropertyOptional({ description: 'Start date of current academic year (ISO8601)', example: '2024-04-01T00:00:00Z' })
    @IsDateString()
    @IsOptional()
    @Transform(({ value }) => value === "" ? undefined : value)
    academicYearStart?: string;

    @ApiPropertyOptional({ description: 'End date of current academic year (ISO8601)', example: '2025-03-31T00:00:00Z' })
    @IsDateString()
    @IsOptional()
    @Transform(({ value }) => value === "" ? undefined : value)
    academicYearEnd?: string;

    @ApiPropertyOptional({ enum: GradingSystem, description: 'Grading system used', example: GradingSystem.PERCENTAGE })
    @IsEnum(GradingSystem)
    @IsOptional()
    @Transform(({ value }) => value === "" ? undefined : value)
    gradingSystem?: GradingSystem;

    @ApiPropertyOptional({ enum: PromotionPolicy, description: 'Student promotion policy', example: PromotionPolicy.MANUAL })
    @IsEnum(PromotionPolicy)
    @IsOptional()
    @Transform(({ value }) => value === "" ? undefined : value)
    promotionPolicy?: PromotionPolicy;

    @ApiPropertyOptional({ description: 'School day start time (ISO8601)', example: '2024-01-01T08:00:00Z' })
    @IsDateString()
    @IsOptional()
    @Transform(({ value }) => value === "" ? undefined : value)
    schoolStartTime?: string;

    @ApiPropertyOptional({ description: 'School day end time (ISO8601)', example: '2024-01-01T15:00:00Z' })
    @IsDateString()
    @IsOptional()
    @Transform(({ value }) => value === "" ? undefined : value)
    schoolEndTime?: string;

    @IsInt()
    @Min(1)
    @IsOptional()
    maxPeriodsPerDay?: number;

    @IsInt()
    @Min(0)
    @IsOptional()
    minGapBetweenPeriods?: number;

    @IsBoolean()
    @IsOptional()
    flexiblePeriodDuration?: boolean;

    @IsInt()
    @Min(1)
    @IsOptional()
    defaultPeriodLength?: number;

    @IsInt()
    @IsOptional()
    lateMarkThreshold?: number;

    @IsInt()
    @IsOptional()
    absentAfter?: number;

    @IsBoolean()
    @IsOptional()
    allowExcuseSubmission?: boolean;

    @IsString()
    @IsOptional()
    weekendDays?: string;

    @IsBoolean()
    @IsOptional()
    halfDays?: boolean;

    @IsInt()
    @Min(1)
    @IsOptional()
    maxSubjectsPerStudent?: number;

    @IsInt()
    @Min(1)
    @IsOptional()
    maxRepeatPeriodsPerDay?: number;

    @IsInt()
    @Min(1)
    @IsOptional()
    maxConsecutiveSameSubject?: number;
}
