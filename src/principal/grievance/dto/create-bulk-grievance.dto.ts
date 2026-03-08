import { IsString, IsNotEmpty, IsOptional, IsArray, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBulkGrievanceDto {
    @ApiProperty({ description: 'Title of the grievance' })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({ description: 'Detailed description of the grievance' })
    @IsString()
    @IsNotEmpty()
    description: string;

    @ApiProperty({ description: 'IDs of the users this grievance is against', type: [Number] })
    @IsArray()
    @IsNumber({}, { each: true })
    @IsNotEmpty()
    againstUserIds: number[];

    @ApiPropertyOptional({ description: 'URLs of attachment files', type: [String] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    attachmentUrls?: string[];
}
