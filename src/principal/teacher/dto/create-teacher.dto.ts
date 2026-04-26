import { IsNotEmpty, IsString, IsEmail, IsOptional, IsDateString, ValidateNested, IsArray, IsEnum, IsInt, IsNumber } from 'class-validator';
import { Type, Transform } from 'class-transformer';

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
    @Transform(({ value }) => {
        if (typeof value === 'string' && /^\d+\.?\d*E\+\d+$/i.test(value)) {
            return BigInt(Number(value)).toString();
        }
        return value;
    })
    phone: string;

    @IsDateString()
    @IsOptional()
    @Transform(({ value }) => {
        if (!value) return value;
        const d = new Date(value);
        if (isNaN(d.getTime())) return value;
        return d.toISOString().split('T')[0];
    })
    joinDate?: string;

    @IsString()
    @IsNotEmpty()
    employmentType: string;

    @IsString()
    @IsOptional()
    department?: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateQualificationDto)
    qualifications?: CreateQualificationDto[];

    // Personal Info
    @IsString()
    @IsNotEmpty()
    gender: string;

    @IsDateString()
    @IsNotEmpty()
    @Transform(({ value }) => {
        if (!value) return value;
        const d = new Date(value);
        if (isNaN(d.getTime())) return value;
        return d.toISOString().split('T')[0];
    })
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
    @Transform(({ value }) => {
        if (typeof value === 'string' && /^\d+\.?\d*E\+\d+$/i.test(value)) {
            return BigInt(Number(value)).toString();
        }
        return value;
    })
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
    @Transform(({ value }) => {
        if (typeof value === 'string' && /^\d+\.?\d*E\+\d+$/i.test(value)) {
            return BigInt(Number(value)).toString();
        }
        return value;
    })
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
    @IsNotEmpty()
    empCode: string;

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
    @Transform(({ value }) => {
        if (!value) return value;
        const d = new Date(value);
        if (isNaN(d.getTime())) return value;
        return d.toISOString().split('T')[0];
    })
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

export class UpsertSalaryConfigDto {
    @IsNumber()
    @IsNotEmpty()
    basicSalary: number;

    @IsNumber()
    @IsOptional()
    allowance?: number;

    @IsNumber()
    @IsOptional()
    deduction?: number;
}

export class UpsertBankAccountDto {
    @IsString()
    @IsNotEmpty()
    accountHolderName: string;

    @IsString()
    @IsNotEmpty()
    bankName: string;

    @IsString()
    @IsNotEmpty()
    accountNumber: string;

    @IsString()
    @IsNotEmpty()
    ifscCode: string;

    @IsInt()
    @IsOptional()
    id?: number;
}

