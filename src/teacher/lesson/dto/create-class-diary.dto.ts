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

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    objective?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    activity?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    remarks?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsArray()
    media?: any[];

    @ApiProperty({ required: false })
    @IsOptional()
    @IsInt()
    lessonId?: number;
}
