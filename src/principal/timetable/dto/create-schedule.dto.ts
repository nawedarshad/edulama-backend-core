import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateScheduleDto {
    @ApiProperty({ description: 'Schedule name', example: 'Primary Schedule' })
    @IsString()
    name: string;

    @ApiPropertyOptional({ description: 'Schedule description' })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiPropertyOptional({ description: 'Set as default schedule', default: false })
    @IsBoolean()
    @IsOptional()
    isDefault?: boolean;

    @ApiPropertyOptional({ description: 'Mark schedule as active', default: true })
    @IsBoolean()
    @IsOptional()
    isActive?: boolean;
}
