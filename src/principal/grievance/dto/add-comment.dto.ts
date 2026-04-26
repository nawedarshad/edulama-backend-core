import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddGrievanceCommentDto {
    @ApiProperty({ example: 'Please provide more details about the incident.' })
    @IsString()
    @IsNotEmpty()
    message: string;
}
