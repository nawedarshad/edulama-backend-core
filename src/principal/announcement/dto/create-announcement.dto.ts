import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUrl,
    ValidateNested,
} from 'class-validator';
import {
    AnnouncementType,
    AnnouncementChannel,
    AudienceType,
    AnnouncementPriority,
} from '@prisma/client';

export class CreateAnnouncementAudienceDto {
    @IsEnum(AudienceType)
    type: AudienceType;

    @IsOptional()
    @IsInt()
    classId?: number;

    @IsOptional()
    @IsInt()
    sectionId?: number;

    @IsOptional()
    @IsInt()
    studentId?: number;

    @IsOptional()
    @IsInt()
    staffId?: number;

    @IsOptional()
    @IsInt()
    roleId?: number;

    @IsOptional()
    @IsInt()
    branchId?: number;
}

export class CreateAnnouncementAttachmentDto {
    @IsString()
    @IsNotEmpty()
    fileName: string;

    @IsString()
    fileType: string;

    @IsString()
    // @IsUrl() // Sometimes internal URLs don't validate as public ISO URLs
    fileUrl: string;

    @IsOptional()
    @IsInt()
    fileSize?: number;
}

export class CreateAnnouncementDto {
    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsNotEmpty()
    body: string;

    @IsOptional()
    @IsString()
    summary?: string;

    @IsInt()
    @IsNotEmpty()
    academicYearId: number;

    @IsEnum(AnnouncementType)
    @IsOptional()
    type?: AnnouncementType = AnnouncementType.GENERAL;

    @IsEnum(AnnouncementChannel, { each: true })
    @IsOptional()
    channels?: AnnouncementChannel[] = [AnnouncementChannel.PUSH];

    @IsEnum(AnnouncementPriority)
    @IsOptional()
    priority?: AnnouncementPriority = AnnouncementPriority.NORMAL;

    @IsBoolean()
    @IsOptional()
    isEmergency?: boolean;

    // Voice Broadcasting
    @IsOptional()
    @IsString()
    voiceAudioUrl?: string;

    @IsOptional()
    @IsInt()
    voiceDuration?: number;

    // Targeting
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateAnnouncementAudienceDto)
    @IsNotEmpty()
    audiences: CreateAnnouncementAudienceDto[];

    // Attachments
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateAnnouncementAttachmentDto)
    @IsOptional()
    attachments?: CreateAnnouncementAttachmentDto[];

    @IsOptional()
    @IsString()
    scheduledAt?: string; // ISO Date string
}
