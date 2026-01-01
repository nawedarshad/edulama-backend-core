import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, ValidateNested } from 'class-validator';
import { CreateClassDto } from './create-class.dto';
import { ApiProperty } from '@nestjs/swagger';

export class BulkCreateClassDto {
    @ApiProperty({ type: [CreateClassDto], description: 'Array of classes to create' })
    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => CreateClassDto)
    classes: CreateClassDto[];
}
