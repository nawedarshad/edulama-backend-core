import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, IsDateString } from 'class-validator';
import { AcademicYearStatus } from '@prisma/client';

export class CreateAcademicYearDto {
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

export class UpdateAcademicYearDto {
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
