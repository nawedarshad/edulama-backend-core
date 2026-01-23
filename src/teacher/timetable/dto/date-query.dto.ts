import { IsDateString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DateQueryDto {
    @ApiPropertyOptional({ description: 'Date in YYYY-MM-DD format', example: '2024-03-20' })
    @IsOptional()
    @IsDateString()
    date?: string;

    @ApiPropertyOptional({ description: 'Start date in YYYY-MM-DD format', example: '2024-03-20' })
    @IsOptional()
    @IsDateString()
    startDate?: string;

    @ApiPropertyOptional({ description: 'End date in YYYY-MM-DD format', example: '2024-03-26' })
    @IsOptional()
    @IsDateString()
    endDate?: string;
}
