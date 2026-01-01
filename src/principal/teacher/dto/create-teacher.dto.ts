import { IsNotEmpty, IsString, IsEmail, IsOptional, IsDateString, ValidateNested, IsArray, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateQualificationDto {
    @IsString()
    @IsNotEmpty()
    degree: string;

    @IsString()
    @IsOptional()
    specialization?: string;

    @IsString()
    @IsNotEmpty()
    institution: string;

    @IsOptional()
    yearOfPassing?: number;
}

export class CreateTeacherDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsEmail()
    @IsNotEmpty()
    email: string;

    @IsString()
    @IsNotEmpty()
    phone: string;

    @IsDateString()
    @IsOptional()
    joinDate?: string;



    @IsOptional()
    @ValidateNested()
    @Type(() => CreateQualificationDto)
    qualifications?: CreateQualificationDto[];

    // Personal Info
    @IsString()
    @IsNotEmpty()
    gender: string;

    @IsDateString()
    @IsNotEmpty()
    dateOfBirth: string;

    @IsString()
    @IsNotEmpty()
    addressLine1: string;

    @IsString()
    @IsOptional()
    nationalIdMasked?: string;

    @IsString()
    @IsOptional()
    taxIdMasked?: string;

    @IsString()
    @IsOptional()
    photo?: string;

    @IsString()
    @IsNotEmpty()
    alternatePhone: string;

    @IsString()
    @IsOptional()
    addressLine2?: string;

    @IsString()
    @IsNotEmpty()
    city: string;

    @IsString()
    @IsNotEmpty()
    state: string;

    @IsString()
    @IsNotEmpty()
    country: string;

    @IsString()
    @IsNotEmpty()
    postalCode: string;

    @IsString()
    @IsNotEmpty()
    emergencyContactName: string;

    @IsString()
    @IsNotEmpty()
    emergencyContactPhone: string;

    @IsString()
    @IsOptional()
    emergencyRelation?: string;

    // Flat Qualification Fields (for Bulk CSV Support)
    @IsString()
    @IsOptional()
    degree?: string;

    @IsString()
    @IsOptional()
    specialization?: string;

    @IsString()
    @IsOptional()
    institution?: string;

    @IsOptional()
    yearOfPassing?: number | string; // Allow string from CSV
}
