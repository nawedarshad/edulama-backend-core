import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDepartmentDto, UpdateDepartmentDto, DepartmentQueryDto, AddDepartmentMemberDto, UpdateDepartmentMemberDto } from './dto/department.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class DepartmentService {
    constructor(private prisma: PrismaService) { }

    async create(schoolId: number, dto: CreateDepartmentDto) {
        const code = dto.code.trim();
        const name = dto.name.trim();

        // Check for duplicate code within the school
        const existing = await this.prisma.department.findUnique({
            where: {
                schoolId_code: {
                    schoolId,
                    code
                }
            },
        });

        if (existing) {
            throw new ConflictException(`Department with code ${code} already exists in this school`);
        }

        return this.prisma.department.create({
            data: {
                ...dto,
                code,
                name,
                schoolId,
            },
        });
    }

    async findAll(schoolId: number, query: DepartmentQueryDto) {
        const { search, type, status, page = 1, limit = 10 } = query;
        const skip = (page - 1) * limit;

        const where: Prisma.DepartmentWhereInput = {
            schoolId,
            ...(type && { type }),
            ...(status && { status }),
            ...(search && {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { code: { contains: search, mode: 'insensitive' } },
                ],
            }),
        };

        const [total, data] = await Promise.all([
            this.prisma.department.count({ where }),
            this.prisma.department.findMany({
                where,
                skip,
                take: limit,
                include: {
                    headUser: { select: { id: true, name: true, photo: true } },
                    _count: { select: { members: true, subjects: true } },
                },
                orderBy: { name: 'asc' },
            }),
        ]);

        return {
            data,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async findOne(schoolId: number, id: number) {
        const department = await this.prisma.department.findFirst({
            where: { id, schoolId },
            include: {
                headUser: { select: { id: true, name: true, photo: true } },
                subjects: { select: { id: true, name: true, code: true } }, // Reduced payload
                _count: { select: { members: true } },
            },
        });

        if (!department) {
            throw new NotFoundException(`Department with ID ${id} not found`);
        }

        return department;
    }

    async update(schoolId: number, id: number, dto: UpdateDepartmentDto) {
        await this.findOne(schoolId, id);

        const data: Prisma.DepartmentUpdateInput = { ...dto };
        if (dto.code) data.code = dto.code.trim();
        if (dto.name) data.name = dto.name.trim();

        if (data.code) {
            const existing = await this.prisma.department.findUnique({
                where: {
                    schoolId_code: {
                        schoolId,
                        code: data.code as string
                    }
                },
            });
            if (existing && existing.id !== id) {
                throw new ConflictException(`Department with code ${data.code} already exists in this school`);
            }
        }

        return this.prisma.department.update({
            where: { id },
            data,
        });
    }

    async remove(schoolId: number, id: number) {
        const dept = await this.prisma.department.findFirst({
            where: { id, schoolId },
            include: {
                _count: { select: { members: true, subjects: true } }
            }
        });

        if (!dept) {
            throw new NotFoundException(`Department with ID ${id} not found`);
        }

        if (dept._count.members > 0) {
            throw new BadRequestException(`Cannot delete department '${dept.name}' because it has ${dept._count.members} active members. Please remove them first.`);
        }

        if (dept._count.subjects > 0) {
            throw new BadRequestException(`Cannot delete department '${dept.name}' because it has ${dept._count.subjects} assigned subjects. Please reassign them first.`);
        }

        return this.prisma.department.delete({ where: { id } });
    }

    // --- Members ---

    async addMember(schoolId: number, departmentId: number, dto: AddDepartmentMemberDto) {
        await this.findOne(schoolId, departmentId);

        // Verify user exists and belongs to school
        const user = await this.prisma.user.findFirst({
            where: { id: dto.userId, schoolId },
        });

        if (!user) {
            throw new NotFoundException(`User with ID ${dto.userId} not found in this school`);
        }

        try {
            return await this.prisma.departmentMember.create({
                data: {
                    departmentId,
                    userId: dto.userId,
                    role: dto.role,
                },
            });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new ConflictException('User is already a member of this department');
            }
            throw error;
        }
    }

    async getMembers(schoolId: number, departmentId: number) {
        await this.findOne(schoolId, departmentId);

        return this.prisma.departmentMember.findMany({
            where: { departmentId },
            include: {
                user: { select: { id: true, name: true, photo: true, role: { select: { name: true } } } },
            },
        });
    }

    async updateMember(schoolId: number, departmentId: number, userId: number, dto: UpdateDepartmentMemberDto) {
        await this.findOne(schoolId, departmentId);

        const member = await this.prisma.departmentMember.findUnique({
            where: {
                departmentId_userId: { departmentId, userId },
            },
        });

        if (!member) {
            throw new NotFoundException('Member not found in this department');
        }

        return this.prisma.departmentMember.update({
            where: {
                departmentId_userId: { departmentId, userId },
            },
            data: dto,
        });
    }

    async removeMember(schoolId: number, departmentId: number, userId: number) {
        await this.findOne(schoolId, departmentId);

        try {
            return await this.prisma.departmentMember.delete({
                where: {
                    departmentId_userId: { departmentId, userId },
                },
            });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
                throw new NotFoundException('Member not found');
            }
            throw error;
        }
    }
}
