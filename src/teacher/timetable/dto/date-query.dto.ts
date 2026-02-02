import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class DateQueryDto {
    @ApiPropertyOptional({ description: 'Specific date (YYYY-MM-DD)' })
    @IsOptional()
    @IsString()
    date?: string;

    @ApiPropertyOptional({ description: 'Start date (YYYY-MM-DD)' })
    @IsOptional()
    @IsString()
    startDate?: string;

    @ApiPropertyOptional({ description: 'End date (YYYY-MM-DD)' })
    @IsOptional()
    @IsString()
    endDate?: string;
}
