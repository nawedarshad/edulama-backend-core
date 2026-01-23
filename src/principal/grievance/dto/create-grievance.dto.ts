import { IsString, IsNotEmpty, IsOptional, IsEnum, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateGrievanceDto {
    @ApiProperty({ description: 'Title of the grievance' })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({ description: 'Detailed description of the grievance' })
    @IsString()
    @IsNotEmpty()
    description: string;

    @ApiPropertyOptional({ description: 'ID of the user this grievance is against (optional)' })
    @IsOptional()
    againstUserId?: number;

    @ApiPropertyOptional({ description: 'URLs of attachment files', type: [String] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    attachmentUrls?: string[];
}
