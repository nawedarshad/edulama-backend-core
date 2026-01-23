import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NoticePriority, NoticeType } from '@prisma/client';

export class CreateNoticeAttachmentDto {
    @IsString()
    @IsNotEmpty()
    fileName: string;

    @IsString()
    fileUrl: string;

    @IsString()
    fileType: string;
}

export class CreateNoticeDto {
    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsNotEmpty()
    content: string;

    @IsEnum(NoticeType)
    type: NoticeType;

    @IsEnum(NoticePriority)
    @IsOptional()
    priority?: NoticePriority = NoticePriority.NORMAL;

    // Context
    @IsInt()
    classId: number;

    @IsOptional()
    @IsInt()
    sectionId?: number;

    @IsOptional()
    @IsInt()
    subjectId?: number;

    // Meta
    @IsBoolean()
    @IsOptional()
    requiresAck?: boolean;

    // Attachments
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateNoticeAttachmentDto)
    @IsOptional()
    attachments?: CreateNoticeAttachmentDto[];
}
