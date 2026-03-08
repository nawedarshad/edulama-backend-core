import { IsString, IsOptional, IsDateString, IsArray, ValidateNested } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { AttachmentDto } from '../../../teacher/homework/dto/create-homework.dto';

export class OverrideHomeworkDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    title?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    dueDate?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    taughtToday?: string;

    @ApiPropertyOptional({ type: [AttachmentDto] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AttachmentDto)
    attachments?: AttachmentDto[];
}
