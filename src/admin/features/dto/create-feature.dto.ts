
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreateFeatureDto {
    @IsString()
    @IsNotEmpty()
    @Matches(/^[A-Z_]+$/, { message: 'Key must be uppercase with underscores (e.g. LIBRARY_MANAGEMENT)' })
    key: string;
}
