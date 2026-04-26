import { IsString, IsNotEmpty, IsOptional, IsEnum, IsInt, IsDateString } from 'class-validator';
import { TaskPriority, TaskStatus } from '@prisma/client';

export class CreateTaskDto {
    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsEnum(TaskPriority)
    @IsOptional()
    priority?: TaskPriority;

    @IsEnum(TaskStatus)
    @IsOptional()
    status?: TaskStatus;

    @IsInt()
    @IsOptional()
    assigneeId?: number;

    @IsDateString()
    @IsOptional()
    dueDate?: string;
}
