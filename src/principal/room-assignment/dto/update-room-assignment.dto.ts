import { IsInt, IsOptional, IsBoolean } from 'class-validator';

export class UpdateRoomAssignmentDto {
    @IsOptional()
    @IsInt()
    roomId?: number;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}
