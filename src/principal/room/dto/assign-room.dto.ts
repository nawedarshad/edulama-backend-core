import { IsNotEmpty, IsInt, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssignRoomDto {
    @ApiProperty({ description: 'ID of the room', example: 10 })
    @IsInt()
    @IsNotEmpty()
    roomId: number;

    @ApiProperty({ description: 'ID of the section to assign', example: 5 })
    @IsInt()
    @IsNotEmpty()
    sectionId: number;

    @ApiPropertyOptional({ description: 'Is assignment active', example: true, default: true })
    @IsBoolean()
    @IsOptional()
    isActive?: boolean = true;
}
