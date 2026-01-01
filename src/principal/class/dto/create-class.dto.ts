import { IsNotEmpty, IsString, IsOptional, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateClassDto {
    @ApiProperty({ description: 'The name of the class', example: 'Class 10' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiPropertyOptional({ description: 'The level of the class', example: 'Secondary' })
    @IsString()
    @IsOptional()
    level?: string;

    @ApiPropertyOptional({ description: 'The capacity of the class', example: 40 })
    @IsInt()
    @IsOptional()
    capacity?: number;

    @ApiPropertyOptional({ description: 'Display order of the class', example: 1 })
    @IsInt()
    @IsOptional()
    order?: number;

    @ApiPropertyOptional({ description: 'Description of the class', example: 'Standard 10th Grade Class' })
    @IsString()
    @IsOptional()
    description?: string;
}
