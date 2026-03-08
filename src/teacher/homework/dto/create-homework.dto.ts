import { IsString, IsOptional, IsInt, IsDateString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AttachmentDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    title?: string;

    @ApiProperty()
    @IsString()
    url: string;
}

export class CreateHomeworkDto {
    @ApiProperty({ description: 'Title of the homework' })
    @IsString()
    title: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    description?: string;

    @ApiProperty({ description: 'Due date (ISO string)' })
    @IsDateString()
    dueDate: string;

    @ApiProperty({ description: 'Academic group ID' })
    @IsInt()
    groupId: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    classId?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    sectionId?: number;

    @ApiProperty({ description: 'Subject ID' })
    @IsInt()
    subjectId: number;

    @ApiPropertyOptional({ description: 'What was taught in the session' })
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
