import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AnnouncementType, AnnouncementPriority } from '@prisma/client';

export class UpdateAnnouncementDto {
    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsString()
    body?: string;

    @IsOptional()
    @IsString()
    summary?: string;

    @IsOptional()
    @IsEnum(AnnouncementType)
    type?: AnnouncementType;

    @IsOptional()
    @IsEnum(AnnouncementPriority)
    priority?: AnnouncementPriority;
}
