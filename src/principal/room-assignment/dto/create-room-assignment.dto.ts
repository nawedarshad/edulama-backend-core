import { IsNotEmpty, IsInt } from 'class-validator';

export class CreateRoomAssignmentDto {
    @IsInt()
    @IsNotEmpty()
    sectionId: number;

    @IsInt()
    @IsNotEmpty()
    roomId: number;
}
