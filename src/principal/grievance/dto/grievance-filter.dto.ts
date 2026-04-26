import { IsOptional, IsEnum, IsNumber, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { GrievanceStatus } from '@prisma/client';

export class GrievanceFilterDto {
    @ApiPropertyOptional({ enum: GrievanceStatus })
    @IsOptional()
    @IsEnum(GrievanceStatus)
    status?: GrievanceStatus;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    raisedById?: number;

    @ApiPropertyOptional({ description: 'Filter by role name' })
    @IsOptional()
    @IsString()
    role?: string;

    @ApiPropertyOptional({ enum: ['ACADEMIC', 'ADMISSION', 'FEES', 'INFRASTRUCTURE', 'TRANSPORT', 'CONDUCT', 'STAFF_RELATED', 'OTHER'] })
    @IsOptional()
    @IsString()
    category?: string;

    @ApiPropertyOptional({ enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] })
    @IsOptional()
    @IsString()
    priority?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    page?: number = 1;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    limit?: number = 10;
}
