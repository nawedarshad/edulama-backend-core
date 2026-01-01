import { IsNotEmpty, IsString, IsEnum, IsOptional } from 'class-validator';
import { Prisma, TodoStatus } from '@prisma/client';

export class CreateTodoDto {
    @IsString()
    @IsNotEmpty()
    text: string;

    @IsOptional()
    @IsEnum(TodoStatus)
    status?: TodoStatus;
}
