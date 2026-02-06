import { IsArray, IsDateString, IsNumber, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SchedulePreviewDto {
    @ApiProperty()
    @IsNumber()
    classId: number;

    @ApiProperty()
    @IsNumber()
    sectionId: number;

    @ApiProperty()
    @IsNumber()
    subjectId: number;

    @ApiProperty({ description: 'YYYY-MM-DD' })
    @IsDateString()
    startDate: string;

    @ApiProperty()
    @IsArray()
    @IsString({ each: true })
    topics: string[];
}
