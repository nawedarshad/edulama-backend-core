import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class StudentFilterDto {
    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    classId?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    sectionId?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    admissionNo?: string;

    @ApiPropertyOptional({ description: 'Partial search by name' })
    @IsOptional()
    @IsString()
    name?: string; // Partial search

    @ApiPropertyOptional({ enum: ['MALE', 'FEMALE', 'OTHER'] })
    @IsOptional()
    @IsEnum(['MALE', 'FEMALE', 'OTHER'])
    gender?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    caste?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    category?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    religion?: string;

    @ApiPropertyOptional({ default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    page?: number;

    @ApiPropertyOptional({ default: 10 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    limit?: number;
}
