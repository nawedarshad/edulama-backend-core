import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDepartmentDto, UpdateDepartmentDto, DepartmentQueryDto, AddDepartmentMemberDto, UpdateDepartmentMemberDto, AddDepartmentMembersBulkDto, AssignSubjectsBulkDto, DepartmentMemberQueryDto, DepartmentSubjectQueryDto } from './dto/department.dto';
import { Prisma } from '@prisma/client';
import * as cacheManager from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

@Injectable()
export class DepartmentService {
    private readonly logger = new Logger(DepartmentService.name);
    private readonly CACHE_TTL = 3600000; // 1 hour

    constructor(
        private prisma: PrismaService,
        @Inject(CACHE_MANAGER) private cacheManager: cacheManager.Cache
    ) { }

    /**
     * Cache Tagging Strategy:
     * We store a 'version' for each school's department data.
     * All list keys include this version.
     * Incrementing the version effectively invalidates all lists for that school instantly.
     */
    private async getVersionKey(schoolId: number): Promise<string> {
        const key = `DEPT_VER:${schoolId}`;
        let version = await this.cacheManager.get<number>(key);
        if (!version) {
            version = Date.now();
            await this.cacheManager.set(key, version, this.CACHE_TTL * 24); // Persistent version
        }
        return `V${version}`;
    }

    private async invalidateSchoolCache(schoolId: number, deptId?: number) {
        this.logger.debug(`Invalidating cache for school ${schoolId}`);
        const versionKey = `DEPT_VER:${schoolId}`;
        await this.cacheManager.set(versionKey, Date.now(), this.CACHE_TTL * 24);

        if (deptId) {
            await this.cacheManager.del(`DEPT_SINGLE:${schoolId}:${deptId}`);
        }
    }

    async create(schoolId: number, dto: CreateDepartmentDto) {
        const code = dto.code.trim();
        const name = dto.name.trim();

        // Validate head user belongs to the same school via UserSchool association
        if (dto.headId) {
            const headAssociation = await this.prisma.userSchool.findFirst({
                where: { userId: dto.headId, schoolId }
            });

            if (!headAssociation) {
                throw new NotFoundException("Head user not found in this school");
            }
        }

        const existing = await this.prisma.department.findUnique({
            where: { schoolId_code: { schoolId, code } },
        });

        if (existing) throw new ConflictException(`Code ${code} exists`);

        const result = await this.prisma.department.create({
            data: { ...dto, code, name, schoolId },
        });

        await this.invalidateSchoolCache(schoolId);
        return result;
    }

    async findAll(schoolId: number, query: DepartmentQueryDto) {
        const ver = await this.getVersionKey(schoolId);
        const cacheKey = `DEPT_LIST:${schoolId}:${ver}:${JSON.stringify(query)}`;

        const cached = await this.cacheManager.get(cacheKey);
        if (cached) return cached;

        const { search, type, status, page = 1, limit = 10 } = query;
        const safeLimit = Math.min(limit, 100);
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
                where, skip, take: safeLimit,
                include: {
                    headUser: { select: { id: true, name: true, photo: true } },
                    _count: { select: { members: true, subjects: true } },
                },
                orderBy: { name: 'asc' },
            }),
        ]);

        const result = { data, meta: { total, page, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) } };
        await this.cacheManager.set(cacheKey, result, this.CACHE_TTL);
        return result;
    }

    async findOne(schoolId: number, id: number) {
        const cacheKey = `DEPT_SINGLE:${schoolId}:${id}`;
        const cached = await this.cacheManager.get(cacheKey);
        if (cached) return cached;

        const department = await this.prisma.department.findFirst({
            where: { id, schoolId },
            include: {
                headUser: { select: { id: true, name: true, photo: true } },
                subjects: { select: { id: true, name: true, code: true } },
                _count: { select: { members: true } },
            },
        });

        if (!department) throw new NotFoundException(`ID ${id} not found`);

        await this.cacheManager.set(cacheKey, department, this.CACHE_TTL);
        return department;
    }

    async findOneFull(schoolId: number, id: number) {
        const department = await this.prisma.department.findFirst({
            where: { id, schoolId },
            include: {
                headUser: {
                    include: {
                        teacherProfile: {
                            include: { personalInfo: { select: { email: true } } }
                        }
                    }
                },
                subjects: { select: { id: true, name: true, code: true } },
                members: {
                    include: {
                        user: {
                            include: {
                                teacherProfile: {
                                    include: {
                                        personalInfo: { select: { email: true } }
                                    }
                                }
                            }
                        }
                    }
                },
                _count: { select: { members: true, subjects: true } },
            },
        });
        if (!department) throw new NotFoundException(`ID ${id} not found`);
        return department;
    }

    async update(schoolId: number, id: number, dto: UpdateDepartmentDto) {
        await this.findOne(schoolId, id);
        const result = await this.prisma.department.update({
            where: { id, schoolId },
            data: { ...dto, ...(dto.code && { code: dto.code.trim() }), ...(dto.name && { name: dto.name.trim() }) },
        });

        await this.invalidateSchoolCache(schoolId, id);
        return result;
    }

    async remove(schoolId: number, id: number) {
        const dept = await this.prisma.department.findFirst({
            where: { id, schoolId },
            include: { _count: { select: { members: true, subjects: true } } }
        });
        if (!dept) throw new NotFoundException(`ID ${id} not found`);
        if (dept._count.members > 0 || dept._count.subjects > 0) throw new BadRequestException('Cannot delete dept with children');

        const result = await this.prisma.department.delete({ where: { id, schoolId } });
        await this.invalidateSchoolCache(schoolId, id);
        return result;
    }

    // --- Members & Subjects (Mutation methods simplified for brevity) ---

    async addMember(schoolId: number, departmentId: number, dto: AddDepartmentMemberDto) {
        await this.findOne(schoolId, departmentId);
        const result = await this.prisma.departmentMember.create({
            data: { departmentId, userId: dto.userId, role: dto.role },
        });
        await this.invalidateSchoolCache(schoolId, departmentId);
        return result;
    }

    async getMembers(schoolId: number, departmentId: number, query: DepartmentMemberQueryDto) {
        const ver = await this.getVersionKey(schoolId);
        const cacheKey = `DEPT_MEMBERS:${schoolId}:${departmentId}:${ver}:${JSON.stringify(query)}`;
        const cached = await this.cacheManager.get(cacheKey);
        if (cached) return cached;

        const { search, role, page = 1, limit = 10 } = query;
        const safeLimit = Math.min(limit, 100);
        const skip = (page - 1) * safeLimit;

        const where: Prisma.DepartmentMemberWhereInput = {
            departmentId,
            ...(role && { role }),
            ...(search && { user: { name: { contains: search, mode: 'insensitive' } } }),
        };

        const [total, data] = await Promise.all([
            this.prisma.departmentMember.count({ where }),
            this.prisma.departmentMember.findMany({
                where, skip, take: safeLimit,
                include: { user: { select: { id: true, name: true, photo: true, role: { select: { name: true } } } } },
                orderBy: { user: { name: 'asc' } },
            }),
        ]);

        const result = { data, meta: { total, page, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) } };
        await this.cacheManager.set(cacheKey, result, this.CACHE_TTL);
        return result;
    }

    async getSubjects(schoolId: number, id: number, query: DepartmentSubjectQueryDto) {
        const ver = await this.getVersionKey(schoolId);
        const cacheKey = `DEPT_SUBJECTS:${schoolId}:${id}:${ver}:${JSON.stringify(query)}`;
        const cached = await this.cacheManager.get(cacheKey);
        if (cached) return cached;

        const { search, page = 1, limit = 10 } = query;
        const safeLimit = Math.min(limit, 100);
        const skip = (page - 1) * safeLimit;

        const where: Prisma.SubjectWhereInput = {
            departmentId: id, schoolId,
            ...(search && { OR: [{ name: { contains: search, mode: 'insensitive' } }, { code: { contains: search, mode: 'insensitive' } }] }),
        };

        const [total, subjects] = await Promise.all([
            this.prisma.subject.count({ where }),
            this.prisma.subject.findMany({
                where, skip, take: safeLimit,
                include: {
                    SubjectAssignment: { where: { isActive: true }, include: { teacher: { include: { user: { select: { id: true, name: true, photo: true } } } }, class: { select: { id: true, name: true } }, section: { select: { id: true, name: true } } } },
                    teacherPreferredSubjects: { include: { teacher: { include: { user: { select: { id: true, name: true } } } } } }
                },
                orderBy: { name: 'asc' }
            }),
        ]);

        const result = {
            data: subjects.map((s: any) => ({ ...s, assignments: s.SubjectAssignment, teacherSpecializations: s.teacherPreferredSubjects })),
            meta: { total, page, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) }
        };
        await this.cacheManager.set(cacheKey, result, this.CACHE_TTL);
        return result;
    }

    async updateMember(schoolId: number, departmentId: number, userId: number, dto: UpdateDepartmentMemberDto) {
        const result = await this.prisma.departmentMember.update({
            where: { departmentId_userId: { departmentId, userId } },
            data: dto,
        });
        await this.invalidateSchoolCache(schoolId, departmentId);
        return result;
    }

    async removeMember(schoolId: number, departmentId: number, userId: number) {
        const result = await this.prisma.departmentMember.delete({
            where: { departmentId_userId: { departmentId, userId } },
        });
        await this.invalidateSchoolCache(schoolId, departmentId);
        return result;
    }

    async addMembersBulk(schoolId: number, departmentId: number, dto: AddDepartmentMembersBulkDto) {
        const users = await this.prisma.user.findMany({ where: { id: { in: dto.userIds }, schoolId }, select: { id: true } });
        const created = await this.prisma.departmentMember.createMany({
            data: users.map(u => ({ departmentId, userId: u.id, role: dto.role || 'TEACHER' })),
            skipDuplicates: true
        });
        await this.invalidateSchoolCache(schoolId, departmentId);
        return { success: true, count: created.count };
    }

    async assignSubjectsBulk(schoolId: number, departmentId: number, dto: AssignSubjectsBulkDto) {
        const updated = await this.prisma.subject.updateMany({
            where: { id: { in: dto.subjectIds }, schoolId },
            data: { departmentId },
        });
        await this.invalidateSchoolCache(schoolId, departmentId);
        return { success: true, count: updated.count };
    }
}
