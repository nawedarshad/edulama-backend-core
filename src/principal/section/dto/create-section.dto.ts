import { IsNotEmpty, IsString, IsInt, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSectionDto {
    @ApiProperty({ description: 'The name of the section', example: 'Section A' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ description: 'ID of the Class this section belongs to', example: 5 })
    @IsInt()
    @IsNotEmpty()
    classId: number;

    @ApiPropertyOptional({ description: 'Capacity of the section', example: 30 })
    @IsInt()
    @IsOptional()
    capacity?: number;

    @ApiPropertyOptional({ description: 'Display order of the section', example: 1 })
    @IsInt()
    @IsOptional()
    order?: number;

    @ApiPropertyOptional({ description: 'Description of the section', example: 'Science Stream Section' })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiPropertyOptional({ description: 'Stream name if applicable', example: 'SCIENCE' })
    @IsString()
    @IsOptional()
    stream?: string;
}
