import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { GrievanceStatus } from '@prisma/client';

export class UpdateGrievanceDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsEnum(GrievanceStatus)
    status?: GrievanceStatus;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    resolutionNote?: string;
}
