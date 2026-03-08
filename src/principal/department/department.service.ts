import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDepartmentDto, UpdateDepartmentDto, DepartmentQueryDto, AddDepartmentMemberDto, UpdateDepartmentMemberDto, AddDepartmentMembersBulkDto, AssignSubjectsBulkDto } from './dto/department.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class DepartmentService {
    constructor(private prisma: PrismaService) { }

    async create(schoolId: number, dto: CreateDepartmentDto) {
        const code = dto.code.trim();
        const name = dto.name.trim();

        // Validate head user belongs to the same school
        if (dto.headId) {
            const head = await this.prisma.user.findFirst({
                where: { id: dto.headId, schoolId }
            });

            if (!head) {
                throw new NotFoundException("Head user not found in this school");
            }
        }

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
        const safeLimit = Math.min(limit, 100); // Prevent memory abuse
        const skip = (page - 1) * safeLimit;

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
                take: safeLimit,
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
                limit: safeLimit,
                totalPages: Math.ceil(total / safeLimit),
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

        // Validate head user belongs to the same school
        if (dto.headId) {
            const head = await this.prisma.user.findFirst({
                where: { id: dto.headId, schoolId }
            });

            if (!head) {
                throw new NotFoundException("Head user not found in this school");
            }
        }

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

        // @ts-ignore - explicitly including schoolId for tenant safety, even if technically redundant
        return this.prisma.department.update({
            where: { id, schoolId },
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

        // @ts-ignore - explicitly including schoolId for tenant safety, even if technically redundant
        return this.prisma.department.delete({ where: { id, schoolId } });
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

        if (dto.role === 'HOD') {
            const existingHod = await this.prisma.departmentMember.findFirst({
                where: { departmentId, role: 'HOD' },
            });
            if (existingHod) {
                throw new ConflictException('A Head of Department (HOD) already exists for this department');
            }
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

    async getSubjects(schoolId: number, id: number) {
        // Validate department existence
        await this.findOne(schoolId, id);

        const subjects = await this.prisma.subject.findMany({
            where: { departmentId: id, schoolId },
            include: {
                SubjectAssignment: {
                    where: { isActive: true },
                    include: {
                        teacher: { include: { user: { select: { id: true, name: true, photo: true } } } },
                        class: { select: { id: true, name: true } },
                        section: { select: { id: true, name: true } }
                    }
                },
                teacherPreferredSubjects: {
                    include: {
                        teacher: { include: { user: { select: { id: true, name: true } } } }
                    }
                }
            },
            orderBy: { name: 'asc' }
        });

        return subjects.map((s: any) => ({
            ...s,
            assignments: s.SubjectAssignment,
            teacherSpecializations: s.teacherPreferredSubjects
        }));
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

        if (dto.role === 'HOD' && member.role !== 'HOD') {
            const existingHod = await this.prisma.departmentMember.findFirst({
                where: { departmentId, role: 'HOD' },
            });
            if (existingHod) {
                throw new ConflictException('A Head of Department (HOD) already exists for this department');
            }
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

    async addMembersBulk(schoolId: number, departmentId: number, dto: AddDepartmentMembersBulkDto) {
        await this.findOne(schoolId, departmentId);

        if (dto.role === 'HOD') {
            throw new BadRequestException('Cannot bulk assign the HOD role due to exclusivity restrictions');
        }

        // Filter valid users
        const users = await this.prisma.user.findMany({
            where: { id: { in: dto.userIds }, schoolId },
            select: { id: true }
        });

        const validUserIds = users.map(u => u.id);

        if (validUserIds.length === 0) {
            throw new BadRequestException('No valid users found to add');
        }

        const created = await this.prisma.departmentMember.createMany({
            data: validUserIds.map(userId => ({
                departmentId,
                userId,
                role: dto.role || 'TEACHER'
            })),
            skipDuplicates: true
        });

        return { success: true, count: created.count };
    }

    async assignSubjectsBulk(schoolId: number, departmentId: number, dto: AssignSubjectsBulkDto) {
        await this.findOne(schoolId, departmentId);

        // Verify subjects exist and belong to the school
        const subjects = await this.prisma.subject.findMany({
            where: { id: { in: dto.subjectIds }, schoolId },
            select: { id: true }
        });

        const validSubjectIds = subjects.map(s => s.id);

        if (validSubjectIds.length !== dto.subjectIds.length) {
            throw new NotFoundException('One or more subjects not found in this school');
        }

        const updated = await this.prisma.subject.updateMany({
            where: { id: { in: validSubjectIds }, schoolId },
            data: { departmentId },
        });

        return { success: true, count: updated.count };
    }
}
