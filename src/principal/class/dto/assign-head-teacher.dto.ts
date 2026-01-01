import { IsInt, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignHeadTeacherDto {
    @ApiProperty({ description: 'ID of the teacher to assign as head teacher', example: 101 })
    @IsInt()
    @IsNotEmpty()
    teacherId: number;
}
