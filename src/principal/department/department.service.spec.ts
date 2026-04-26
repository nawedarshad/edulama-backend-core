import { Test, TestingModule } from '@nestjs/testing';
import { DepartmentService } from './department.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDepartmentDto, DepartmentQueryDto } from './dto/department.dto';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { DepartmentType, DepartmentStatus, Prisma } from '@prisma/client';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

describe('DepartmentService', () => {
    let service: DepartmentService;
    let prismaService: PrismaService;

    const schoolId = 1;
    const departmentId = 1;
    const userId = 101;

    const mockDepartment = {
        id: departmentId,
        schoolId,
        code: 'SCI',
        name: 'Science',
        type: DepartmentType.ACADEMIC,
        status: DepartmentStatus.ACTIVE,
        description: 'Science Dept',
        createdAt: new Date(),
        updatedAt: new Date(),
        headUser: { id: userId, name: 'John Doe', photo: null },
        _count: { members: 5, subjects: 2 },
    };

    const mockCacheManager = {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
    };

    const mockPrismaService = {
        department: {
            findUnique: jest.fn(),
            create: jest.fn(),
            count: jest.fn(),
            findMany: jest.fn(),
            findFirst: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        },
        user: {
            findFirst: jest.fn(),
            findMany: jest.fn(),
        },
        departmentMember: {
            create: jest.fn(),
            findMany: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            findFirst: jest.fn(),
            createMany: jest.fn(),
        },
        subject: {
            findMany: jest.fn(),
            updateMany: jest.fn(),
        },
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DepartmentService,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: CACHE_MANAGER, useValue: mockCacheManager },
            ],
        }).compile();

        service = module.get<DepartmentService>(DepartmentService);
        prismaService = module.get<PrismaService>(PrismaService);
        mockCacheManager.get.mockResolvedValue(null);
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('create', () => {
        const createDto: CreateDepartmentDto = {
            code: 'MATH',
            name: 'Mathematics ', // with trailing space to test trim
            description: 'Math Dept',
            headId: userId,
        };

        it('should create a department successfully', async () => {
            mockPrismaService.user.findFirst.mockResolvedValue({ id: userId, schoolId });
            mockPrismaService.department.findUnique.mockResolvedValue(null);
            mockPrismaService.department.create.mockResolvedValue({
                id: 2,
                ...createDto,
                code: 'MATH',
                name: 'Mathematics',
                schoolId,
            });

            const result = await service.create(schoolId, createDto);

            expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith({
                where: { id: userId, schoolId },
            });
            expect(mockPrismaService.department.findUnique).toHaveBeenCalledWith({
                where: { schoolId_code: { schoolId, code: 'MATH' } },
            });
            expect(mockPrismaService.department.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({ name: 'Mathematics' })
            }));
            expect(result.code).toEqual('MATH');
        });

        it('should throw NotFoundException if head user belongs to different school', async () => {
            mockPrismaService.user.findFirst.mockResolvedValue(null);
            await expect(service.create(schoolId, createDto)).rejects.toThrow(NotFoundException);
        });

        it('should throw ConflictException if code exists in school', async () => {
            mockPrismaService.user.findFirst.mockResolvedValue({ id: userId, schoolId });
            mockPrismaService.department.findUnique.mockResolvedValue({ id: 2 });

            await expect(service.create(schoolId, createDto)).rejects.toThrow(ConflictException);
        });
    });

    describe('findAll', () => {
        const query: DepartmentQueryDto = { page: 1, limit: 10, search: 'Sci' };

        it('should return paginated departments', async () => {
            mockPrismaService.department.count.mockResolvedValue(1);
            mockPrismaService.department.findMany.mockResolvedValue([mockDepartment]);

            const result = await (service.findAll(schoolId, query) as any);

            expect(result.data).toEqual([mockDepartment]);
            expect(result.meta.total).toEqual(1);
            expect(result.meta.limit).toEqual(10);
            expect(mockPrismaService.department.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({
                    schoolId,
                    OR: [
                        { name: { contains: 'Sci', mode: 'insensitive' } },
                        { code: { contains: 'Sci', mode: 'insensitive' } },
                    ]
                }),
            }));
        });

        it('should enforce safe limit', async () => {
            mockPrismaService.department.count.mockResolvedValue(1);
            mockPrismaService.department.findMany.mockResolvedValue([mockDepartment]);

            const result = await (service.findAll(schoolId, { limit: 1000 } as any) as any);
            expect(result.meta.limit).toEqual(100);
            expect(mockPrismaService.department.findMany).toHaveBeenCalledWith(expect.objectContaining({
                take: 100
            }));
        });
    });

    describe('findOne', () => {
        it('should return a department', async () => {
            mockPrismaService.department.findFirst.mockResolvedValue(mockDepartment);

            const result = await service.findOne(schoolId, departmentId);

            expect(result).toEqual(mockDepartment);
            expect(mockPrismaService.department.findFirst).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: departmentId, schoolId }
            }));
        });

        it('should throw NotFoundException if department not found', async () => {
            mockPrismaService.department.findFirst.mockResolvedValue(null);

            await expect(service.findOne(schoolId, 999)).rejects.toThrow(NotFoundException);
        });
    });

    describe('update', () => {
        it('should update a department', async () => {
            mockPrismaService.department.findFirst.mockResolvedValue(mockDepartment);
            mockPrismaService.department.update.mockResolvedValue({ ...mockDepartment, name: 'Updated Name' });

            const result = await service.update(schoolId, departmentId, { name: 'Updated Name' });

            expect(mockPrismaService.department.update).toHaveBeenCalled();
            expect(result.name).toEqual('Updated Name');
        });

        it('should validate headId school boundary on update', async () => {
            mockPrismaService.department.findFirst.mockResolvedValue(mockDepartment);
            mockPrismaService.user.findFirst.mockResolvedValue(null);

            await expect(service.update(schoolId, departmentId, { headId: 999 })).rejects.toThrow(NotFoundException);
        });

        it('should throw ConflictException if updating code to existing one', async () => {
            mockPrismaService.department.findMany.mockResolvedValue([]); // for findFirst in findOne
            mockPrismaService.department.findFirst.mockResolvedValue(mockDepartment);
            mockPrismaService.department.findUnique.mockResolvedValue({ id: 2, code: 'OTHER' });

            await expect(service.update(schoolId, departmentId, { code: 'OTHER' })).rejects.toThrow(ConflictException);
        });
    });

    describe('remove', () => {
        it('should remove a department if safe', async () => {
            mockPrismaService.department.findFirst.mockResolvedValue({
                ...mockDepartment,
                _count: { members: 0, subjects: 0 },
            });
            mockPrismaService.department.delete.mockResolvedValue(mockDepartment);

            await service.remove(schoolId, departmentId);

            expect(mockPrismaService.department.delete).toHaveBeenCalledWith({ where: { id: departmentId, schoolId } });
        });

        it('should throw BadRequestException if department has members', async () => {
            mockPrismaService.department.findFirst.mockResolvedValue({
                ...mockDepartment,
                _count: { members: 1, subjects: 0 },
            });

            await expect(service.remove(schoolId, departmentId)).rejects.toThrow(BadRequestException);
        });

        it('should throw BadRequestException if department has subjects', async () => {
            mockPrismaService.department.findFirst.mockResolvedValue({
                ...mockDepartment,
                _count: { members: 0, subjects: 1 },
            });

            await expect(service.remove(schoolId, departmentId)).rejects.toThrow(BadRequestException);
        });
    });

    describe('Membership Management', () => {
        describe('addMember', () => {
            it('should add a member successfully', async () => {
                mockPrismaService.department.findFirst.mockResolvedValue(mockDepartment);
                mockPrismaService.user.findFirst.mockResolvedValue({ id: userId, schoolId });
                mockPrismaService.departmentMember.create.mockResolvedValue({ userId, departmentId });

                const result = await service.addMember(schoolId, departmentId, { userId, role: 'TEACHER' });

                expect(result).toBeDefined();
                expect(mockPrismaService.departmentMember.create).toHaveBeenCalledWith({
                    data: { departmentId, userId, role: 'TEACHER' }
                });
            });

            it('should throw ConflictException if HOD already exists', async () => {
                mockPrismaService.department.findFirst.mockResolvedValue(mockDepartment);
                mockPrismaService.user.findFirst.mockResolvedValue({ id: userId, schoolId });
                mockPrismaService.departmentMember.findFirst.mockResolvedValue({ id: 1 });

                await expect(service.addMember(schoolId, departmentId, { userId, role: 'HOD' })).rejects.toThrow(ConflictException);
            });

            it('should throw ConflictException on P2002 error', async () => {
                mockPrismaService.department.findFirst.mockResolvedValue(mockDepartment);
                mockPrismaService.user.findFirst.mockResolvedValue({ id: userId, schoolId });
                const error = new Prisma.PrismaClientKnownRequestError('msg', { code: 'P2002', clientVersion: '1' });
                mockPrismaService.departmentMember.create.mockRejectedValue(error);

                await expect(service.addMember(schoolId, departmentId, { userId, role: 'TEACHER' })).rejects.toThrow(ConflictException);
            });
        });

        describe('getMembers', () => {
            it('should return department members', async () => {
                mockPrismaService.department.findFirst.mockResolvedValue(mockDepartment);
                mockPrismaService.departmentMember.findMany.mockResolvedValue([{ userId: 1 }]);

                const result = await (service.getMembers(schoolId, departmentId, {}) as any);

                expect(result.data).toHaveLength(1);
                expect(result.meta).toBeDefined();
                expect(mockPrismaService.departmentMember.findMany).toHaveBeenCalled();
            });
        });

        describe('updateMember', () => {

            it('should update a member successfully', async () => {
                mockPrismaService.department.findFirst.mockResolvedValue(mockDepartment);
                mockPrismaService.departmentMember.findUnique.mockResolvedValue({ userId, role: 'TEACHER' });
                mockPrismaService.departmentMember.findFirst.mockResolvedValue(null); // No existing HOD
                mockPrismaService.departmentMember.update.mockResolvedValue({ userId, role: 'HOD' });

                await service.updateMember(schoolId, departmentId, userId, { role: 'HOD' });

                expect(mockPrismaService.departmentMember.update).toHaveBeenCalled();
            });

            it('should throw ConflictException when changing to HOD and one exists', async () => {
                mockPrismaService.department.findFirst.mockResolvedValue(mockDepartment);
                mockPrismaService.departmentMember.findUnique.mockResolvedValue({ userId, role: 'TEACHER' });
                mockPrismaService.departmentMember.findFirst.mockResolvedValue({ userId: 999, role: 'HOD' });

                await expect(service.updateMember(schoolId, departmentId, userId, { role: 'HOD' })).rejects.toThrow(ConflictException);
            });
        });

        describe('removeMember', () => {
            it('should remove a member', async () => {
                mockPrismaService.department.findFirst.mockResolvedValue(mockDepartment);
                mockPrismaService.departmentMember.delete.mockResolvedValue({});

                await service.removeMember(schoolId, departmentId, userId);
                expect(mockPrismaService.departmentMember.delete).toHaveBeenCalled();
            });

            it('should throw NotFoundException on P2025 error', async () => {
                mockPrismaService.department.findFirst.mockResolvedValue(mockDepartment);
                const error = new Prisma.PrismaClientKnownRequestError('msg', { code: 'P2025', clientVersion: '1' });
                mockPrismaService.departmentMember.delete.mockRejectedValue(error);

                await expect(service.removeMember(schoolId, departmentId, userId)).rejects.toThrow(NotFoundException);
            });

            it('should rethrow unknown errors', async () => {
                mockPrismaService.department.findFirst.mockResolvedValue(mockDepartment);
                mockPrismaService.departmentMember.delete.mockRejectedValue(new Error('Unknown'));

                await expect(service.removeMember(schoolId, departmentId, userId)).rejects.toThrow('Unknown');
            });
        });

        describe('addMembersBulk', () => {
            it('should add multiple members', async () => {
                mockPrismaService.department.findFirst.mockResolvedValue(mockDepartment);
                mockPrismaService.user.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
                mockPrismaService.departmentMember.createMany.mockResolvedValue({ count: 2 });

                const result = await service.addMembersBulk(schoolId, departmentId, { userIds: [1, 2], role: 'TEACHER' });

                expect(result.count).toEqual(2);
                expect(mockPrismaService.departmentMember.createMany).toHaveBeenCalled();
            });

            it('should throw BadRequestException if no valid users found', async () => {
                mockPrismaService.department.findFirst.mockResolvedValue(mockDepartment);
                mockPrismaService.user.findMany.mockResolvedValue([]);

                await expect(service.addMembersBulk(schoolId, departmentId, { userIds: [1], role: 'TEACHER' })).rejects.toThrow(BadRequestException);
            });

            it('should throw BadRequestException for HOD bulk assignment', async () => {
                await expect(service.addMembersBulk(schoolId, departmentId, { userIds: [1], role: 'HOD' })).rejects.toThrow(BadRequestException);
            });
        });
    });

    describe('Edge Case Branches', () => {
        it('remove: should throw NotFoundException if department not found', async () => {
            mockPrismaService.department.findFirst.mockResolvedValue(null);
            await expect(service.remove(schoolId, 999)).rejects.toThrow(NotFoundException);
        });

        it('addMember: should throw NotFoundException if user not found in school', async () => {
            mockPrismaService.department.findFirst.mockResolvedValue(mockDepartment);
            mockPrismaService.user.findFirst.mockResolvedValue(null);
            await expect(service.addMember(schoolId, departmentId, { userId: 999, role: 'TEACHER' })).rejects.toThrow(NotFoundException);
        });

        it('addMember: should rethrow unknown errors', async () => {
            mockPrismaService.department.findFirst.mockResolvedValue(mockDepartment);
            mockPrismaService.user.findFirst.mockResolvedValue({ id: 1, schoolId });
            mockPrismaService.departmentMember.create.mockRejectedValue(new Error('Random'));
            await expect(service.addMember(schoolId, departmentId, { userId: 1, role: 'TEACHER' })).rejects.toThrow('Random');
        });

        it('updateMember: should throw NotFoundException if member not found', async () => {
            mockPrismaService.department.findFirst.mockResolvedValue(mockDepartment);
            mockPrismaService.departmentMember.findUnique.mockResolvedValue(null);
            await expect(service.updateMember(schoolId, departmentId, 999, { role: 'TEACHER' })).rejects.toThrow(NotFoundException);
        });
    });


    describe('Subject Management', () => {
        describe('assignSubjectsBulk', () => {
            it('should assign subjects to department', async () => {
                mockPrismaService.department.findFirst.mockResolvedValue(mockDepartment);
                mockPrismaService.subject.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
                mockPrismaService.subject.updateMany.mockResolvedValue({ count: 2 });

                const result = await service.assignSubjectsBulk(schoolId, departmentId, { subjectIds: [1, 2] });

                expect(result.success).toBe(true);
                expect(mockPrismaService.subject.updateMany).toHaveBeenCalledWith(expect.objectContaining({
                    where: { id: { in: [1, 2] }, schoolId },
                    data: { departmentId }
                }));
            });

            it('should throw NotFoundException if some subjects are missing', async () => {
                mockPrismaService.department.findFirst.mockResolvedValue(mockDepartment);
                mockPrismaService.subject.findMany.mockResolvedValue([{ id: 1 }]); // Only 1 found but 2 requested

                await expect(service.assignSubjectsBulk(schoolId, departmentId, { subjectIds: [1, 2] })).rejects.toThrow(NotFoundException);
            });
        });

        describe('getSubjects', () => {
            it('should return department subjects with assignments', async () => {
                mockPrismaService.department.findFirst.mockResolvedValue(mockDepartment);
                mockPrismaService.subject.findMany.mockResolvedValue([
                    {
                        id: 1,
                        name: 'Math',
                        SubjectAssignment: [],
                        teacherPreferredSubjects: []
                    }
                ]);

                const result = await (service.getSubjects(schoolId, departmentId, {}) as any);

                expect(result.data).toHaveLength(1);
                expect(result.meta).toBeDefined();
                expect(result.data[0]).toHaveProperty('assignments');
            });
        });
    });
});
