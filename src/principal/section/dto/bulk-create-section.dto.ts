import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, ValidateNested } from 'class-validator';
import { CreateSectionDto } from './create-section.dto';
import { ApiProperty } from '@nestjs/swagger';

export class BulkCreateSectionDto {
    @ApiProperty({ type: [CreateSectionDto], description: 'Array of sections to create' })
    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => CreateSectionDto)
    sections: CreateSectionDto[];
}
