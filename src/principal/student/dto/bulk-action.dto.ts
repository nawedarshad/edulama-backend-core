import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsNumber, IsOptional } from 'class-validator';

export enum StudentBulkActionType {
    PROMOTE = 'PROMOTE',
    DEACTIVATE = 'DEACTIVATE',
    ACTIVATE = 'ACTIVATE',
    SET_HOUSE = 'SET_HOUSE',
}

export class StudentBulkActionDto {
    @ApiProperty({ description: 'Array of student IDs to perform action on', type: [Number] })
    @IsArray()
    @IsNumber({}, { each: true })
    studentIds: number[];

    @ApiProperty({ enum: StudentBulkActionType })
    @IsEnum(StudentBulkActionType)
    action: StudentBulkActionType;

    @ApiProperty({ description: 'Required for SET_HOUSE', required: false })
    @IsOptional()
    @IsNumber()
    houseId?: number;

    @ApiProperty({ description: 'Required for PROMOTE', required: false })
    @IsOptional()
    @IsNumber()
    targetClassId?: number;

    @ApiProperty({ description: 'Required for PROMOTE', required: false })
    @IsOptional()
    @IsNumber()
    targetSectionId?: number;
}
