import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskStatus } from '@prisma/client';

@Injectable()
export class TaskService {
    constructor(private readonly prisma: PrismaService) {}

    async create(userId: number, schoolId: number, dto: CreateTaskDto) {
        return this.prisma.task.create({
            data: {
                ...dto,
                dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
                creatorId: userId,
                schoolId: schoolId,
            },
            include: {
                assignee: { select: { id: true, name: true, photo: true } },
                creator: { select: { id: true, name: true, photo: true } },
            },
        });
    }

    async findAll(schoolId: number, userId: number, filters?: { status?: TaskStatus; type?: 'MY_TASKS' | 'ASSIGNED_TO_ME' | 'CREATED_BY_ME' }) {
        const where: any = { schoolId };

        if (filters?.status) {
            where.status = filters.status;
        }

        if (filters?.type === 'MY_TASKS') {
            // Tasks either created by me OR assigned to me
            where.OR = [
                { creatorId: userId },
                { assigneeId: userId }
            ];
        } else if (filters?.type === 'ASSIGNED_TO_ME') {
            where.assigneeId = userId;
        } else if (filters?.type === 'CREATED_BY_ME') {
            where.creatorId = userId;
        }

        return this.prisma.task.findMany({
            where,
            include: {
                assignee: { select: { id: true, name: true, photo: true } },
                creator: { select: { id: true, name: true, photo: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async findOne(id: number, schoolId: number) {
        const task = await this.prisma.task.findUnique({
            where: { id },
            include: {
                assignee: { select: { id: true, name: true, photo: true } },
                creator: { select: { id: true, name: true, photo: true } },
            },
        });

        if (!task || task.schoolId !== schoolId) {
            throw new NotFoundException('Task not found');
        }

        return task;
    }

    async update(id: number, userId: number, schoolId: number, dto: UpdateTaskDto) {
        const task = await this.findOne(id, schoolId);

        // Security: only creator or assignee can update status. Only creator can update other fields.
        const isCreator = task.creatorId === userId;
        const isAssignee = task.assigneeId === userId;

        if (!isCreator && !isAssignee) {
            throw new ForbiddenException('You do not have permission to update this task');
        }

        const updateData: any = { ...dto };
        if (dto.dueDate) updateData.dueDate = new Date(dto.dueDate);
        
        // If status is being set to COMPLETED, record the time
        if (dto.status === TaskStatus.COMPLETED && task.status !== TaskStatus.COMPLETED) {
            updateData.completedAt = new Date();
        }

        return this.prisma.task.update({
            where: { id },
            data: updateData,
            include: {
                assignee: { select: { id: true, name: true, photo: true } },
                creator: { select: { id: true, name: true, photo: true } },
            },
        });
    }

    async remove(id: number, userId: number, schoolId: number) {
        const task = await this.findOne(id, schoolId);

        if (task.creatorId !== userId) {
            throw new ForbiddenException('Only the creator can delete this task');
        }

        return this.prisma.task.delete({ where: { id } });
    }
}
