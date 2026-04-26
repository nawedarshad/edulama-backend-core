import { IsString, IsNotEmpty, IsOptional, IsInt, IsArray, IsEnum, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GrievanceCategory, GrievancePriority } from '@prisma/client';

export class CreateGrievanceDto {
    @ApiProperty({ example: 'Academic Issue' })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({ example: 'I am facing issues with...' })
    @IsString()
    @IsNotEmpty()
    description: string;

    @ApiProperty({ enum: GrievanceCategory, example: 'ACADEMIC' })
    @IsEnum(GrievanceCategory)
    @IsNotEmpty()
    category: GrievanceCategory;

    @ApiProperty({ enum: GrievancePriority, example: 'MEDIUM' })
    @IsEnum(GrievancePriority)
    @IsOptional()
    priority?: GrievancePriority;

    @ApiPropertyOptional({ example: false })
    @IsBoolean()
    @IsOptional()
    isAnonymous?: boolean;

    @ApiPropertyOptional({ example: 101 })
    @IsInt()
    @IsOptional()
    againstUserId?: number;

    @ApiPropertyOptional({ type: [String], example: ['https://storage.com/evidence.jpg'] })
    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    attachmentUrls?: string[];
}
