import { IsDateString, IsOptional } from 'class-validator';

export class GetSubstitutionsFilterDto {
    @IsDateString()
    @IsOptional()
    date?: string;
}
