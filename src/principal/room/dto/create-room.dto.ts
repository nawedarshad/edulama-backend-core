import { IsNotEmpty, IsString, IsInt, IsOptional, IsEnum, IsBoolean, IsArray } from 'class-validator';
import { RoomType, RoomStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoomDto {
    @ApiProperty({ description: 'Name of the room', example: 'Lab 1' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiPropertyOptional({ description: 'Room code', example: 'L-101' })
    @IsString()
    @IsOptional()
    code?: string;

    @ApiPropertyOptional({ description: 'Block name', example: 'East Block' })
    @IsString()
    @IsOptional()
    block?: string;

    @ApiPropertyOptional({ description: 'Floor number', example: 1 })
    @IsInt()
    @IsOptional()
    floor?: number;

    @ApiProperty({ enum: RoomType, description: 'Type of room', example: RoomType.CLASSROOM })
    @IsEnum(RoomType)
    @IsNotEmpty()
    roomType: RoomType;

    @ApiPropertyOptional({ enum: RoomStatus, description: 'Status of room', example: RoomStatus.ACTIVE })
    @IsEnum(RoomStatus)
    @IsOptional()
    status?: RoomStatus;

    @ApiPropertyOptional({ description: 'Capacity of the room', example: 30 })
    @IsInt()
    @IsOptional()
    capacity?: number;

    @ApiPropertyOptional({ description: 'Available facilities', example: ['Projector', 'Whiteboard'], type: [String] })
    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    facilities?: string[];
}
