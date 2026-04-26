import { IsString, IsNotEmpty, IsOptional, IsArray, IsNumber, IsEnum, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GrievanceCategory, GrievancePriority } from '@prisma/client';

export class CreateBulkGrievanceDto {
    @ApiProperty({ example: 'Behavioral Issue' })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({ example: 'The group was found violating...' })
    @IsString()
    @IsNotEmpty()
    description: string;

    @ApiProperty({ enum: GrievanceCategory })
    @IsEnum(GrievanceCategory)
    @IsNotEmpty()
    category: GrievanceCategory;

    @ApiPropertyOptional({ enum: GrievancePriority })
    @IsEnum(GrievancePriority)
    @IsOptional()
    priority?: GrievancePriority;

    @ApiPropertyOptional({ example: false })
    @IsBoolean()
    @IsOptional()
    isAnonymous?: boolean;

    @ApiProperty({ description: 'IDs of the users this grievance is against', type: [Number] })
    @IsArray()
    @IsNumber({}, { each: true })
    againstUserIds: number[];

    @ApiPropertyOptional({ type: [String] })
    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    attachmentUrls?: string[];
}
