import { IsString, IsNotEmpty, IsOptional, IsArray, IsNumber, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSyllabusDto {
    @ApiProperty({ description: 'Title of the syllabus topic' })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiPropertyOptional({ description: 'Description of the syllabus topic' })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({ description: 'List of attachments (files or links)' })
    @IsOptional()
    @IsArray()
    attachments?: any[]; // Allow JSON array structure

    @ApiPropertyOptional({ description: 'Parent Syllabus ID for hierarchy' })
    @IsOptional()
    @IsNumber()
    parentId?: number;

    @ApiPropertyOptional({ description: 'Order index for sorting' })
    @IsOptional()
    @IsNumber()
    orderIndex?: number;

    @ApiPropertyOptional({ description: 'Learning outcomes' })
    @IsOptional()
    @IsString()
    learningOutcomes?: string;

    @ApiPropertyOptional({ description: 'Estimated hours to complete' })
    @IsOptional()
    @IsNumber()
    estimatedHours?: number;

    @ApiPropertyOptional({ description: 'Status', enum: ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DEFERRED'] })
    @IsOptional()
    @IsEnum(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DEFERRED'])
    status?: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'DEFERRED';
}
