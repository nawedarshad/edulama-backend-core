import { IsString, IsOptional, IsEnum, IsInt } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { GrievanceStatus, GrievancePriority } from '@prisma/client';

export class UpdateGrievanceDto {
    @ApiPropertyOptional({ enum: GrievanceStatus })
    @IsEnum(GrievanceStatus)
    @IsOptional()
    status?: GrievanceStatus;

    @ApiPropertyOptional({ enum: GrievancePriority })
    @IsEnum(GrievancePriority)
    @IsOptional()
    priority?: GrievancePriority;

    @ApiPropertyOptional({ example: 102 })
    @IsInt()
    @IsOptional()
    assignedToId?: number;

    @ApiPropertyOptional({ example: 'This issue has been resolved by...' })
    @IsString()
    @IsOptional()
    resolutionNote?: string;
}
