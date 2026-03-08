import { IsNotEmpty, IsString, IsOptional, IsInt, IsEnum, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SectionCreateDto {
    @ApiProperty({ description: 'The name of the section', example: 'A' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiPropertyOptional({ description: 'The capacity of the section', example: 40 })
    @IsInt()
    @IsOptional()
    @Min(1)
    capacity?: number;

    @ApiPropertyOptional({ description: 'Description of the section', example: 'Morning Shift' })
    @IsString()
    @IsOptional()
    description?: string;
}

export class CreateClassWithSectionsDto {
    @ApiProperty({ description: 'The name of the class', example: 'Class 10' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ description: 'The educational stage of the class', enum: ['KINDERGARTEN', 'PRIMARY', 'MIDDLE', 'SECONDARY', 'SENIOR_SECONDARY'], example: 'PRIMARY' })
    @IsEnum(['KINDERGARTEN', 'PRIMARY', 'MIDDLE', 'SECONDARY', 'SENIOR_SECONDARY'])
    @IsOptional()
    stage?: 'KINDERGARTEN' | 'PRIMARY' | 'MIDDLE' | 'SECONDARY' | 'SENIOR_SECONDARY';

    @ApiPropertyOptional({ description: 'The capacity of the class', example: 40 })
    @IsInt()
    @IsOptional()
    capacity?: number;

    @ApiPropertyOptional({ description: 'Schedule ID to assign this class to a specific bell schedule' })
    @IsInt()
    @IsOptional()
    scheduleId?: number;

    @ApiPropertyOptional({ description: 'Description of the class', example: 'Standard 10th Grade Class' })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiPropertyOptional({ description: 'Display order of the class', example: 1 })
    @IsInt()
    @IsOptional()
    order?: number;

    @ApiProperty({ description: 'Sections to create with the class', type: [SectionCreateDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SectionCreateDto)
    sections: SectionCreateDto[];
}
