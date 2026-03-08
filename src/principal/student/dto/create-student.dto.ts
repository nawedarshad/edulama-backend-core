import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsDateString,
    IsEmail,
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    ValidateNested,
    Matches,
    Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// --------------------------------------------------------
// 1. NESTED DTOS
// --------------------------------------------------------

export enum Religion {
    HINDUISM = 'HINDUISM',
    ISLAM = 'ISLAM',
    CHRISTIANITY = 'CHRISTIANITY',
    SIKHISM = 'SIKHISM',
    BUDDHISM = 'BUDDHISM',
    JAINISM = 'JAINISM',
    OTHER = 'OTHER'
}

export enum BloodGroup {
    A_POS = 'A_POS',
    A_NEG = 'A_NEG',
    B_POS = 'B_POS',
    B_NEG = 'B_NEG',
    AB_POS = 'AB_POS',
    AB_NEG = 'AB_NEG',
    O_POS = 'O_POS',
    O_NEG = 'O_NEG',
    UNKNOWN = 'UNKNOWN'
}

export enum Caste {
    GENERAL = 'GENERAL',
    OBC = 'OBC',
    SC = 'SC',
    ST = 'ST',
    OTHER = 'OTHER'
}

export enum StudentCategory {
    GENERAL = 'GENERAL',
    RTE = 'RTE',
    STAFF_WARD = 'STAFF_WARD',
    SIBLING = 'SIBLING',
    MANAGEMENT_QUOTA = 'MANAGEMENT_QUOTA',
    EWS = 'EWS',
    OTHER = 'OTHER'
}

export class CreateStudentPersonalInfoDto {
    @ApiProperty({ enum: ['MALE', 'FEMALE', 'OTHER'] })
    @IsEnum(['MALE', 'FEMALE', 'OTHER'])
    @IsNotEmpty()
    gender: string;

    @ApiPropertyOptional({ enum: BloodGroup })
    @IsEnum(BloodGroup)
    @IsOptional()
    bloodGroup?: BloodGroup;

    @ApiPropertyOptional({ enum: Religion })
    @IsEnum(Religion)
    @IsOptional()
    religion?: Religion;

    @ApiPropertyOptional({ enum: Caste })
    @IsEnum(Caste)
    @IsOptional()
    caste?: Caste;

    @ApiPropertyOptional({ enum: StudentCategory })
    @IsEnum(StudentCategory)
    @IsOptional()
    category?: StudentCategory;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    nationality?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    motherTongue?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    studentPhone?: string;

    @ApiPropertyOptional()
    @IsEmail()
    @IsOptional()
    studentEmail?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    currentAddress?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    permanentAddress?: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    city: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    state: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    pincode: string;

    @ApiPropertyOptional()
    @IsBoolean()
    @IsOptional()
    isDisabled?: boolean;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    disabilityDetails?: string;
}

export class CreateStudentDocumentDto {
    @ApiProperty({ example: 'Birth Certificate' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ example: 'PDF' })
    @IsString()
    @IsNotEmpty()
    type: string;

    @ApiProperty({ example: 'https://example.com/file.pdf' })
    @IsString()
    @IsNotEmpty()
    url: string;
}

export class CreateStudentPreviousEducationDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    schoolName: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    lastClass?: string;

    @ApiPropertyOptional()
    @IsNumber()
    @IsOptional()
    yearOfPassing?: number;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    marksObtained?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    tcNumber?: string;

    @ApiPropertyOptional()
    @IsDateString()
    @IsOptional()
    tcDate?: string;
}

export class CreateStudentHealthRecordDto {
    @ApiPropertyOptional()
    @IsNumber()
    @IsOptional()
    height?: number;

    @ApiPropertyOptional()
    @IsNumber()
    @IsOptional()
    weight?: number;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    allergies?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    medicalConditions?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    medications?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    familyDoctorName?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    familyDoctorContact?: string;
}

// --------------------------------------------------------
// 2. GUARDIAN DTO (new normalized model)
// --------------------------------------------------------

export enum GuardianRelation {
    FATHER = 'FATHER',
    MOTHER = 'MOTHER',
    GUARDIAN = 'GUARDIAN',
}

export class CreateGuardianDto {
    @ApiProperty({ description: 'Display name of the parent/guardian' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiPropertyOptional({ description: 'Contact phone number' })
    @IsString()
    @IsOptional()
    @Matches(/^[6-9]\d{9}$/, { message: 'Please enter a valid 10-digit mobile number' })
    phone?: string;

    @ApiProperty({ enum: GuardianRelation })
    @IsEnum(GuardianRelation)
    @IsNotEmpty()
    relation: GuardianRelation;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    occupation?: string;

    @ApiPropertyOptional({ description: 'If true, the admin confirmed that the existing User (matched by email) is the correct person. Required when user already exists.' })
    @IsBoolean()
    @IsOptional()
    confirmedExisting?: boolean;
}

// --------------------------------------------------------
// 3. MAIN DTO
// --------------------------------------------------------

export class CreateStudentDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    @Length(2, 120)
    @Matches(/^[A-Za-z\s]+$/, { message: 'Full name can only contain letters and spaces' })
    fullName: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    admissionNo: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    rollNo?: string;

    @ApiPropertyOptional({ example: '2010-01-01' })
    @IsDateString()
    @IsOptional()
    dob?: string;

    @ApiPropertyOptional({ example: '2024-04-01' })
    @IsDateString()
    @IsOptional()
    admissionDate?: string;

    @ApiProperty()
    @IsNumber()
    @IsNotEmpty()
    classId: number;

    @ApiProperty()
    @IsNumber()
    @IsNotEmpty()
    sectionId: number;

    @ApiPropertyOptional()
    @IsNumber()
    @IsOptional()
    houseId?: number;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    photo?: string;

    // --- NESTED RELATIONS ---

    @ApiPropertyOptional({ type: CreateStudentPersonalInfoDto })
    @ValidateNested()
    @Type(() => CreateStudentPersonalInfoDto)
    @IsOptional()
    personalInfo?: CreateStudentPersonalInfoDto;

    @ApiPropertyOptional({ type: [CreateStudentDocumentDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateStudentDocumentDto)
    @IsOptional()
    documents?: CreateStudentDocumentDto[];

    @ApiPropertyOptional({ type: [CreateStudentPreviousEducationDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateStudentPreviousEducationDto)
    @IsOptional()
    previousEducation?: CreateStudentPreviousEducationDto[];

    @ApiPropertyOptional({ type: CreateStudentHealthRecordDto })
    @ValidateNested()
    @Type(() => CreateStudentHealthRecordDto)
    @IsOptional()
    healthRecord?: CreateStudentHealthRecordDto;

    // --- GUARDIAN / PARENT RELATIONS ---

    @ApiPropertyOptional({
        type: [CreateGuardianDto],
        description:
            'Array of parent/guardian profiles to link to this student. ' +
            'If a guardian email already exists in the system and confirmedExisting=true, the existing User is linked. ' +
            'If the email is new, a new User + ParentProfile is created.',
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateGuardianDto)
    @IsOptional()
    guardians?: CreateGuardianDto[];

    @ApiPropertyOptional({ description: 'Primary family login email. Used to find or create the central User account.' })
    @IsEmail()
    @IsOptional()
    primaryEmail?: string;

    @ApiPropertyOptional({ description: 'Indicates the primary email matches an existing user who was confirmed.' })
    @IsBoolean()
    @IsOptional()
    primaryEmailConfirmed?: boolean;
}
