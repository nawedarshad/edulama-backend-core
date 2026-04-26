import { IsString, IsNotEmpty, IsOptional, IsInt, IsEnum, IsBoolean, IsNumber, IsHexColor, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { SubjectType, AssessmentType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSubjectDto {
    @ApiProperty({ description: 'Name of the subject', example: 'Mathematics' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ description: 'Unique code for the subject (scoped to School/Year)', example: 'MATH-101' })
    @IsString()
    @IsNotEmpty()
    code: string;

    @ApiPropertyOptional({ description: 'ID of the department this subject belongs to', example: 1 })
    @IsInt()
    @IsOptional()
    departmentId?: number;

    // Visuals
    @ApiPropertyOptional({ description: 'Hex color code for UI representation', example: '#FF5733' })
    @IsHexColor()
    @IsOptional()
    color?: string;

    @ApiPropertyOptional({ description: 'Icon identifier', example: 'calculator' })
    @IsString()
    @IsOptional()
    icon?: string;

    @ApiPropertyOptional({ description: 'Detailed description of the subject', example: 'Core mathematics curriculum' })
    @IsString()
    @IsOptional()
    description?: string;
}

export class UpdateSubjectDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    code?: string;

    @IsInt()
    @IsOptional()
    departmentId?: number;

    @IsHexColor()
    @IsOptional()
    color?: string;

    @IsString()
    @IsOptional()
    icon?: string;

    @IsString()
    @IsOptional()
    description?: string;
}

export class CreateClassSubjectDto {
    @ApiProperty({ description: 'ID of the class', example: 1 })
    @IsInt()
    @IsNotEmpty()
    classId: number;

    @ApiPropertyOptional({ description: 'ID of the section (optional, applies to all if omitted)', example: 2 })
    @IsInt()
    @IsOptional()
    sectionId?: number;

    @ApiProperty({ description: 'ID of the subject to assign', example: 10 })
    @IsInt()
    @IsNotEmpty()
    subjectId: number;

    @ApiPropertyOptional({ description: 'Type of subject assignment', enum: SubjectType, example: 'CORE' })
    @IsEnum(SubjectType)
    @IsOptional()
    type?: SubjectType;

    @ApiPropertyOptional({ description: 'Credit value for GPA calculation', example: 4.0 })
    @IsNumber()
    @IsOptional()
    credits?: number;

    @ApiPropertyOptional({ description: 'Target weekly classes', example: 5 })
    @IsInt()
    @IsOptional()
    weeklyClasses?: number;

    @ApiPropertyOptional({ description: 'Maximum marks', example: 100 })
    @IsNumber()
    @IsOptional()
    maxMarks?: number;

    @ApiPropertyOptional({ description: 'Passing marks', example: 33 })
    @IsNumber()
    @IsOptional()
    passMarks?: number;

    @ApiPropertyOptional({ description: 'Is the subject optional?', example: false })
    @IsBoolean()
    @IsOptional()
    isOptional?: boolean;

    @ApiPropertyOptional({ description: 'Does the subject have a lab component?', example: true })
    @IsBoolean()
    @IsOptional()
    hasLab?: boolean;

    @ApiPropertyOptional({ description: 'Is the subject graded?', example: true })
    @IsBoolean()
    @IsOptional()
    isGraded?: boolean;

    @ApiPropertyOptional({ description: 'Assessment type', enum: AssessmentType, example: 'MARKS' })
    @IsEnum(AssessmentType)
    @IsOptional()
    assessmentType?: AssessmentType;

    @ApiPropertyOptional({ description: 'Exclude from GPA calculation?', example: false })
    @IsBoolean()
    @IsOptional()
    excludeFromGPA?: boolean;

    @ApiPropertyOptional({ description: 'Optional display name override', example: 'Mathematics (Advanced)' })
    @IsString()
    @IsOptional()
    displayName?: string;

    @ApiPropertyOptional({ description: 'Specific code for this class subject instance', example: 'MATH-10-A' })
    @IsString()
    @IsOptional()
    classSubjectCode?: string;

    @ApiPropertyOptional({ description: 'Flexible configuration object' })
    @IsOptional()
    configuration?: any;

    @ApiPropertyOptional({ description: 'ID of the teacher assigned to this subject', example: 5 })
    @IsInt()
    @IsOptional()
    teacherId?: number;
}

export class UpdateClassSubjectDto {
    @IsEnum(SubjectType)
    @IsOptional()
    type?: SubjectType;

    @IsNumber()
    @IsOptional()
    credits?: number;

    @IsInt()
    @IsOptional()
    weeklyClasses?: number;

    @IsNumber()
    @IsOptional()
    maxMarks?: number;

    @IsNumber()
    @IsOptional()
    passMarks?: number;

    @IsBoolean()
    @IsOptional()
    isOptional?: boolean;

    @IsBoolean()
    @IsOptional()
    hasLab?: boolean;

    @IsBoolean()
    @IsOptional()
    isGraded?: boolean;

    @IsEnum(AssessmentType)
    @IsOptional()
    assessmentType?: AssessmentType;

    @IsBoolean()
    @IsOptional()
    excludeFromGPA?: boolean;

    @IsString()
    @IsOptional()
    classSubjectCode?: string;

    @IsInt()
    @IsOptional()
    teacherId?: number;
}

export class CreateCategoryDto {
    @ApiProperty({ description: 'Name of the category', example: 'Academic' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiPropertyOptional({ description: 'Detailed description', example: 'Standard academic subjects' })
    @IsString()
    @IsOptional()
    description?: string;
}

export class UpdateCategoryDto {
    @ApiPropertyOptional({ description: 'Name of the category' })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiPropertyOptional({ description: 'Detailed description' })
    @IsString()
    @IsOptional()
    description?: string;
}

export class GetSubjectsQueryDto {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @IsOptional()
    page?: number = 1;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    @IsOptional()
    limit?: number = 10;

    @IsString()
    @IsOptional()
    search?: string;

    @Type(() => Number)
    @IsInt()
    @IsOptional()
    categoryId?: number;
}

export class BulkCopyDto {
    @IsInt()
    @Min(1)
    fromClassId: number;

    @IsInt()
    @Min(1)
    toClassId: number;

    @IsBoolean()
    copyTeachers: boolean;
}

export class AssignTeacherSubjectDto {
    @IsInt()
    @IsNotEmpty()
    classId: number;

    @IsInt()
    @IsNotEmpty()
    sectionId: number;

    @IsInt()
    @IsNotEmpty()
    subjectId: number;

    @IsInt()
    @IsNotEmpty()
    teacherId: number;

    @IsInt()
    @IsOptional()
    periodsPerWeek?: number;
}
