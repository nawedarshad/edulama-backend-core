import { IsArray, IsInt, IsNotEmpty } from 'class-validator';

export class AssignLateMonitorsDto {
    @IsArray()
    @IsInt({ each: true })
    userIds: number[];

    @IsInt()
    @IsNotEmpty()
    academicYearId: number;
}
