import { IsInt, IsNotEmpty, IsOptional, IsString, IsDateString, IsEnum } from 'class-validator';
import { TimetableOverrideType } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateSubstitutionDto {
    @IsInt()
    @IsNotEmpty()
    entryId: number;

    @IsDateString()
    @IsNotEmpty()
    date: string;

    @IsEnum(TimetableOverrideType)
    @IsOptional()
    type?: TimetableOverrideType = TimetableOverrideType.SUBSTITUTE;

    @IsInt()
    @IsOptional() // Optional if type is CANCELLED
    substituteTeacherId?: number;

    @IsInt()
    @IsOptional()
    substituteRoomId?: number;

    @IsString()
    @IsOptional()
    note?: string;
}
