import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';

@Injectable()
export class PrincipalLeaveTypeService {
    constructor(private readonly prisma: PrismaService) { }

    async create(schoolId: number, dto: CreateLeaveTypeDto) {
        // Check for duplicate code within category
        const existing = await this.prisma.leaveType.findFirst({
            where: {
                schoolId,
                code: dto.code,
                category: dto.category,
            },
        });

        if (existing) {
            throw new ConflictException(`Leave type with code '${dto.code}' already exists for this category.`);
        }

        return this.prisma.leaveType.create({
            data: {
                ...dto,
                schoolId,
            },
        });
    }

    async findAll(schoolId: number) {
        return this.prisma.leaveType.findMany({
            where: { schoolId },
            orderBy: { name: 'asc' },
        });
    }

    async findOne(schoolId: number, id: number) {
        const leaveType = await this.prisma.leaveType.findFirst({
            where: { id, schoolId },
        });

        if (!leaveType) {
            throw new NotFoundException('Leave type not found');
        }

        return leaveType;
    }

    async update(schoolId: number, id: number, dto: UpdateLeaveTypeDto) {
        await this.findOne(schoolId, id); // Validate existence

        // If updating code, check uniqueness again
        if (dto.code) {
            const existing = await this.prisma.leaveType.findFirst({
                where: {
                    schoolId,
                    code: dto.code,
                    category: dto.category, // Note: if category changes, this check might need more logic, but category usually shouldn't change
                    NOT: { id },
                },
            });
            if (existing) {
                throw new ConflictException(`Leave type with code '${dto.code}' already exists.`);
            }
        }

        return this.prisma.leaveType.update({
            where: { id },
            data: dto,
        });
    }

    async remove(schoolId: number, id: number) {
        await this.findOne(schoolId, id); // Validate existence

        // Check if used in requests
        const usageCount = await this.prisma.leaveRequest.count({
            where: { leaveTypeId: id }
        });

        if (usageCount > 0) {
            // Soft delete or just error?
            // Usually better to just deactivate if used.
            // But user asked for DELETE.
            // Let's try to delete. If FK constraints exist, it will fail naturally, but we can be nice about it.
            throw new ConflictException('Cannot delete leave type that has existing leave requests. Please deactivate it instead.');
        }

        return this.prisma.leaveType.delete({
            where: { id },
        });
    }
}
