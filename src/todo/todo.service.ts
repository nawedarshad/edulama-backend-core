import { Injectable, NotFoundException, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { Prisma, TodoStatus } from '@prisma/client';

@Injectable()
export class TodoService {
    private readonly logger = new Logger(TodoService.name);

    constructor(private readonly prisma: PrismaService) { }

    async create(userId: number, schoolId: number, dto: CreateTodoDto) {
        return this.prisma.todo.create({
            data: {
                text: dto.text,
                status: dto.status || TodoStatus.TODO,
                userId,
                schoolId,
            },
        });
    }

    async findAll(userId: number) {
        return this.prisma.todo.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });
    }

    async findOne(userId: number, id: number) {
        const todo = await this.prisma.todo.findUnique({
            where: { id },
        });

        if (!todo) {
            throw new NotFoundException(`Todo with ID ${id} not found`);
        }

        if (todo.userId !== userId) {
            throw new ForbiddenException('Access denied');
        }

        return todo;
    }

    async update(userId: number, id: number, dto: UpdateTodoDto) {
        await this.findOne(userId, id); // Ensure existence and ownership

        return this.prisma.todo.update({
            where: { id },
            data: {
                ...dto,
            },
        });
    }

    async toggleComplete(userId: number, id: number) {
        const todo = await this.findOne(userId, id);
        const newStatus = todo.status === TodoStatus.DONE ? TodoStatus.TODO : TodoStatus.DONE;

        return this.prisma.todo.update({
            where: { id },
            data: { status: newStatus },
        });
    }

    async remove(userId: number, id: number) {
        await this.findOne(userId, id); // Ensure existence and ownership

        return this.prisma.todo.delete({
            where: { id },
        });
    }
}
