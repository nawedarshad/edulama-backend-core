import { IsInt, IsOptional, IsPositive, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAllocationDto {
    @ApiProperty({ example: 1, description: 'ID of the class' })
    @IsInt()
    @IsPositive()
    classId: number;

    @ApiProperty({ example: 1, description: 'ID of the section (optional)', required: false })
    @IsInt()
    @IsPositive()
    @IsOptional()
    sectionId?: number;

    @ApiProperty({ example: 101, description: 'ID of the subject' })
    @IsInt()
    @IsPositive()
    subjectId: number;

    @ApiProperty({ example: 50, description: 'ID of the teacher profile' })
    @IsInt()
    @IsPositive()
    teacherId: number;

    @ApiProperty({ example: 5, description: 'Number of periods per week', required: false })
    @IsInt()
    @Min(1)
    @IsOptional()
    periodsPerWeek?: number;
}

export class UpdateAllocationDto {
    @ApiProperty({ example: 55, description: 'ID of the new teacher profile to replace current one' })
    @IsInt()
    @IsPositive()
    teacherId: number;

    @ApiProperty({ example: 6, description: 'Updated periods per week', required: false })
    @IsInt()
    @Min(1)
    @IsOptional()
    periodsPerWeek?: number;
}

export class AllocationFilterDto {
    @ApiProperty({ required: false, description: 'Filter by Class ID' })
    @IsInt()
    @IsOptional()
    classId?: number;

    @ApiProperty({ required: false, description: 'Filter by Section ID' })
    @IsInt()
    @IsOptional()
    sectionId?: number;

    @ApiProperty({ required: false, description: 'Filter by Subject ID' })
    @IsInt()
    @IsOptional()
    subjectId?: number;

    @ApiProperty({ required: false, description: 'Filter by Teacher ID' })
    @IsInt()
    @IsOptional()
    teacherId?: number;
}
