import { IsArray, IsInt } from 'class-validator';

export class CreateMonitorDto {
    @IsArray()
    @IsInt({ each: true })
    userIds: number[];
}
