import { IsString, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MarkStudentLeftDto {
    @ApiProperty({ description: 'Reason for leaving the school' })
    @IsString()
    @IsNotEmpty()
    reason: string;

    @ApiProperty({ description: 'Date of leaving', required: false })
    @IsOptional()
    @IsDateString()
    leftDate?: string;
}
