import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEmail, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { Religion, BloodGroup, Caste, StudentCategory, GuardianRelation } from './create-student.dto';


export class BulkStudentUploadItemDto {
    // Academic Details
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

    @ApiProperty({ example: '2010-01-01' })
    @IsString()
    @IsNotEmpty()
    dob: string;

    @ApiPropertyOptional({ example: '2024-04-01' })
    @Transform(({ value }) => value === '' ? undefined : value)
    @IsString()
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
    @Transform(({ value }) => value === '' ? undefined : value)
    @IsEmail()
    @IsOptional()
    studentEmail?: string;

    // Personal Info
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
    residentialAddress?: string;

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
    @IsString()
    @IsOptional()
    country?: string;

    // Family Login Details
    @ApiProperty()
    @IsEmail()
    @IsNotEmpty()
    primaryEmail: string;

    // Father's Details
    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    fatherName?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    fatherPhone?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    fatherOccupation?: string;

    // Mother's Details
    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    motherName?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    motherPhone?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    motherOccupation?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    shouldActivate?: boolean;
}

export class BulkStudentUploadDto {
    @ApiProperty({ type: [BulkStudentUploadItemDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BulkStudentUploadItemDto)
    students: BulkStudentUploadItemDto[];
}
