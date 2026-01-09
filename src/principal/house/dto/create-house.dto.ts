import { IsNotEmpty, IsOptional, IsString, IsNumber, IsHexColor } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateHouseDto {
    @ApiProperty({ description: 'Name of the house', example: 'Red House' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiPropertyOptional({ description: 'Color code for the house', example: '#FF0000' })
    @IsString()
    @IsOptional()
    @IsHexColor()
    color?: string;

    @ApiPropertyOptional({ description: 'URL of the house logo', example: 'https://example.com/logo.png' })
    @IsString()
    @IsOptional()
    logo?: string;

    @ApiPropertyOptional({ description: 'Motto of the house', example: 'Strength and Honor' })
    @IsString()
    @IsOptional()
    motto?: string;

    @ApiPropertyOptional({ description: 'ID of the House Master (Teacher)', example: 1 })
    @IsNumber()
    @IsOptional()
    houseMasterId?: number;

    @ApiPropertyOptional({ description: 'ID of the House Captain (Student)', example: 101 })
    @IsNumber()
    @IsOptional()
    captainStudentId?: number;

    @ApiPropertyOptional({ description: 'ID of the House Vice Captain (Student)', example: 102 })
    @IsNumber()
    @IsOptional()
    viceCaptainStudentId?: number;
}
