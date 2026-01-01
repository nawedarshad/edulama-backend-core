import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateTeacherDto } from './create-teacher.dto';

export class BulkCreateTeacherDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateTeacherDto)
    teachers: CreateTeacherDto[];
}
