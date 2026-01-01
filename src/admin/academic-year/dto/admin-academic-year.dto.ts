import { IsString, IsNotEmpty, IsDateString, IsEnum, IsOptional, IsInt } from 'class-validator';
import { AcademicYearStatus } from '@prisma/client';

export class AdminCreateAcademicYearDto {
    @IsInt()
    @IsNotEmpty()
    schoolId: number;

    @IsString()
    @IsNotEmpty()
    name: string;

    @IsDateString()
    @IsNotEmpty()
    startDate: string;

    @IsDateString()
    @IsNotEmpty()
    endDate: string;

    @IsEnum(AcademicYearStatus)
    @IsOptional()
    status?: AcademicYearStatus;
}

export class AdminUpdateAcademicYearDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsDateString()
    @IsOptional()
    startDate?: string;

    @IsDateString()
    @IsOptional()
    endDate?: string;

    @IsEnum(AcademicYearStatus)
    @IsOptional()
    status?: AcademicYearStatus;
}
