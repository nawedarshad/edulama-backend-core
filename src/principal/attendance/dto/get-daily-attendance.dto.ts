import { IsDateString, IsNotEmpty } from 'class-validator';

export class GetDailyAttendanceDto {
    @IsNotEmpty()
    @IsDateString()
    date: string;
}
