import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';
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
}
