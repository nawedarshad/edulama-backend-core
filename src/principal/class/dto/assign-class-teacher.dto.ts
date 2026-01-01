import { IsInt, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignClassTeacherDto {
    @ApiProperty({ description: 'ID of the section', example: 5 })
    @IsInt()
    @IsNotEmpty()
    sectionId: number;

    @ApiProperty({ description: 'ID of the teacher', example: 101 })
    @IsInt()
    @IsNotEmpty()
    teacherId: number;
}
