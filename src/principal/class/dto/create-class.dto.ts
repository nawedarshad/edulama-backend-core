import { IsNotEmpty, IsString, IsOptional, IsInt, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateClassDto {
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

    @ApiPropertyOptional({ description: 'Display order of the class', example: 1 })
    @IsInt()
    @IsOptional()
    order?: number;

    @ApiPropertyOptional({ description: 'Description of the class', example: 'Standard 10th Grade Class' })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiPropertyOptional({ description: 'Schedule ID to assign this class to a specific bell schedule' })
    @IsInt()
    @IsOptional()
    scheduleId?: number;
}
