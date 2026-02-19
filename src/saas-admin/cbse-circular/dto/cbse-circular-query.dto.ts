import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CbseCircularType } from '@prisma/client';

export class CbseCircularQueryDto {
    @IsEnum(CbseCircularType)
    @IsOptional()
    type?: CbseCircularType;

    @IsString()
    @IsOptional()
    search?: string;

    @IsOptional()
    page?: number;

    @IsOptional()
    limit?: number;
}
