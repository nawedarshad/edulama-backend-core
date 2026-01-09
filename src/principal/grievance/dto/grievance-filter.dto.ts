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
