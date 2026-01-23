import { IsInt, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TimetableStatus } from '@prisma/client';

export class BulkStatusUpdateDto {
    @ApiProperty({ description: 'Section ID to update' })
    @IsInt()
    sectionId: number;

    @ApiProperty({ enum: TimetableStatus, description: 'Target status' })
    @IsEnum(TimetableStatus)
    status: TimetableStatus;
}
