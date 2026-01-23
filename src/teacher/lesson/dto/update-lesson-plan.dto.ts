import { PartialType } from '@nestjs/swagger';
import { CreateLessonPlanDto } from './create-lesson-plan.dto';
import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateLessonPlanDto extends PartialType(CreateLessonPlanDto) {
    @ApiPropertyOptional({ description: 'Reflection notes after lesson' })
    @IsString()
    @IsOptional()
    reflection?: string;

    @ApiPropertyOptional({ description: 'Coverage notes' })
    @IsString()
    @IsOptional()
    coverageNote?: string;
}
