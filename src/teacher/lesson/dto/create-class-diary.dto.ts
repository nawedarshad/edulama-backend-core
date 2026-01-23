import { IsInt, IsNotEmpty, IsOptional, IsString, IsISO8601, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateClassDiaryDto {
    @ApiProperty()
    @IsInt()
    @IsNotEmpty()
    classId: number;

    @ApiProperty()
    @IsInt()
    @IsNotEmpty()
    sectionId: number;

    @ApiProperty()
    @IsInt()
    @IsNotEmpty()
    subjectId: number;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    topic?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    homework?: string;

    @ApiProperty()
    @IsISO8601()
    @IsNotEmpty()
    lessonDate: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsArray()
    studyMaterial?: any[];
}
