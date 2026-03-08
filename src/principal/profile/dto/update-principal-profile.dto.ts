import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePrincipalProfileDto {
    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    photo?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    employment?: {
        designation?: string;
        department?: string;
        empCode?: string;
        joiningDate?: string;
        employmentType?: string;
        qualifications?: string[];
        certifications?: string[];
    };

    @ApiProperty({ required: false })
    @IsOptional()
    contact?: {
        phone?: string;
        email?: string;
        address?: string;
    };
}
