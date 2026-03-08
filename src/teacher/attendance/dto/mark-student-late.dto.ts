import { IsInt, IsString, IsOptional, IsDateString } from 'class-validator';

export class MarkStudentLateDto {
    @IsInt()
    userId: number; // Student's User ID

    @IsInt()
    academicYearId: number;

    @IsInt()
    classId: number;

    @IsInt()
    sectionId: number;

    @IsDateString()
    date: string; // ISO format date

    @IsString()
    @IsOptional()
    lateReason?: string;
}
