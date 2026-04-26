import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { TimetableOverrideType } from '@prisma/client';

// Deliberately NOT extending CreateSubstitutionDto — entryId and date are immutable after creation.
export class UpdateSubstitutionDto {
    @IsEnum(TimetableOverrideType)
    @IsOptional()
    type?: TimetableOverrideType;

    @IsInt()
    @IsOptional()
    substituteTeacherId?: number;

    @IsInt()
    @IsOptional()
    substituteRoomId?: number;

    @IsString()
    @IsOptional()
    @MaxLength(500)
    note?: string;
}
