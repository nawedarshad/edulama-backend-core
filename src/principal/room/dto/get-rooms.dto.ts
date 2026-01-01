import { IsOptional, IsString, IsInt, IsEnum, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { RoomType, RoomStatus } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetRoomsDto {
    @ApiPropertyOptional({ description: 'Search term for name or code' })
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({ enum: RoomStatus, description: 'Filter by status' })
    @IsOptional()
    @IsEnum(RoomStatus)
    status?: RoomStatus;

    @ApiPropertyOptional({ description: 'Filter by block' })
    @IsOptional()
    @IsString()
    block?: string;

    @ApiPropertyOptional({ description: 'Filter by floor' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    floor?: number;

    @ApiPropertyOptional({ enum: RoomType, description: 'Filter by room type' })
    @IsOptional()
    @IsEnum(RoomType)
    roomType?: RoomType;

    @ApiPropertyOptional({ description: 'Page number', default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @ApiPropertyOptional({ description: 'Items per page', default: 20 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number = 20;
}
