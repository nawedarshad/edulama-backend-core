import { IsEnum, IsNotEmpty, IsOptional, IsString, IsArray, ValidateNested, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { CbseCircularType } from '@prisma/client';

export class CreateCbseCircularAttachmentDto {
    @IsString()
    @IsNotEmpty()
    fileName: string;

    @IsString()
    @IsNotEmpty()
    fileUrl: string;

    @IsString()
    @IsNotEmpty()
    fileType: string;
}

export class CreateCbseCircularDto {
    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsNotEmpty()
    content: string;

    @IsEnum(CbseCircularType)
    @IsOptional()
    type?: CbseCircularType;

    @IsDateString()
    @IsOptional()
    date?: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateCbseCircularAttachmentDto)
    @IsOptional()
    attachments?: CreateCbseCircularAttachmentDto[];
}
