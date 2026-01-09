import { IsNotEmpty, IsString, IsEmail, IsOptional, IsDateString, ValidateNested, IsArray, IsEnum, IsInt, IsNumber } from 'class-validator';
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

    // =================================================================
    // NEW FIELDS FOR TEACHER ENHANCEMENTS
    // =================================================================

    @IsOptional()
    @IsArray()
    @IsInt({ each: true })
    preferredSubjectIds?: number[];

    @IsOptional()
    @IsArray()
    @IsEnum(['KINDERGARTEN', 'PRIMARY', 'MIDDLE', 'SECONDARY', 'SENIOR_SECONDARY'], { each: true })
    preferredStages?: ('KINDERGARTEN' | 'PRIMARY' | 'MIDDLE' | 'SECONDARY' | 'SENIOR_SECONDARY')[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    skills?: string[];

    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => CreateCertificationDto)
    certifications?: CreateCertificationDto[];

    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => CreateTrainingDto)
    trainings?: CreateTrainingDto[];

    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => CreateResponsibilityDto)
    additionalRoles?: CreateResponsibilityDto[];

    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => CreateAppraisalDto)
    appraisals?: CreateAppraisalDto[];

    @IsString()
    @IsOptional()
    empCode?: string;

    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => CreateDocumentDto)
    documents?: CreateDocumentDto[];
}

// Sub-DTOs
export class CreateCertificationDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    issuer: string;

    @IsInt()
    @IsNotEmpty()
    year: number;

    @IsString()
    @IsOptional()
    url?: string;
}

export class CreateTrainingDto {
    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsNotEmpty()
    organizer: string;

    @IsDateString()
    @IsNotEmpty()
    date: string;

    @IsInt()
    @IsNotEmpty()
    durationHours: number;

    @IsString()
    @IsOptional()
    notes?: string;
}

export class CreateResponsibilityDto {
    @IsString()
    @IsNotEmpty()
    roleName: string;
}

export class CreateAppraisalDto {
    @IsInt()
    @IsNotEmpty()
    academicYearId: number;

    @IsNumber()
    @IsOptional()
    kpiScore?: number;

    @IsNumber()
    @IsOptional()
    studentFeedbackScore?: number;

    @IsString()
    @IsOptional()
    principalNotes?: string;
}

export class CreateDocumentDto {
    @IsString()
    @IsNotEmpty()
    type: string; // ID_PROOF, EXPERIENCE_LETTER, CERTIFICATE

    @IsString()
    @IsNotEmpty()
    ref: string; // S3 key / URL / document ID
}

