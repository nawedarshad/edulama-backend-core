import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLessonPlanDto {
    @ApiProperty({ description: 'Class ID' })
    @IsInt()
    @IsNotEmpty()
    classId: number;

    @ApiProperty({ description: 'Section ID' })
    @IsInt()
    @IsNotEmpty()
    sectionId: number;

    @ApiProperty({ description: 'Subject ID' })
    @IsInt()
    @IsNotEmpty()
    subjectId: number;

    @ApiPropertyOptional({ description: 'Class Subject ID (if applicable)' })
    @IsInt()
    @IsOptional()
    classSubjectId?: number;

    @ApiProperty({ description: 'Lesson Title' })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    chapter?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    topic?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty({ description: 'Lesson Date (ISO8601)' })
    @IsDateString()
    @IsNotEmpty()
    lessonDate: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    homework?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    materials?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    notes?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    objectives?: string;

    @ApiPropertyOptional()
    @IsOptional()
    resourceLinks?: any; // Accepting JSON as any for now, or could define a class
}
