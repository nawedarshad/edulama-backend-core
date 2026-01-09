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

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    city?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    state?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    pincode?: string;

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
// 2. PARENT DTO
// --------------------------------------------------------

export class CreateParentDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    fatherName: string;

    @ApiProperty()
    @IsEmail()
    @IsNotEmpty()
    fatherEmail: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    fatherContact: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    fatherOccupation?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    motherName?: string;

    @ApiPropertyOptional()
    @IsEmail()
    @IsOptional()
    motherEmail?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    motherContact?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    motherOccupation?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    guardianName?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    guardianContact?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    guardianRelation?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    emergencyContact?: string;

    @ApiPropertyOptional()
    @IsNumber()
    @IsOptional()
    annualIncome?: number;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    permanentAddress?: string;
}

// --------------------------------------------------------
// 3. MAIN DTO
// --------------------------------------------------------

export class CreateStudentDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
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

    // --- PARENT RELATION ---

    @ApiProperty({ type: CreateParentDto })
    @ValidateNested()
    @Type(() => CreateParentDto)
    @IsNotEmpty()
    parent: CreateParentDto;
}
