import { Test, TestingModule } from '@nestjs/testing';
import { DepartmentService } from './department.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDepartmentDto, DepartmentQueryDto } from './dto/department.dto';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { DepartmentType, DepartmentStatus } from '@prisma/client';

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
        },
        departmentMember: {
            create: jest.fn(),
            findMany: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        },
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DepartmentService,
                { provide: PrismaService, useValue: mockPrismaService },
            ],
        }).compile();

        service = module.get<DepartmentService>(DepartmentService);
        prismaService = module.get<PrismaService>(PrismaService);

        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('create', () => {
        const createDto: CreateDepartmentDto = {
            code: 'MATH',
            name: 'Mathematics',
            description: 'Math Dept',
        };

        it('should create a department successfully', async () => {
            mockPrismaService.department.findUnique.mockResolvedValue(null);
            mockPrismaService.department.create.mockResolvedValue({
                id: 2,
                ...createDto,
                schoolId,
            });

            const result = await service.create(schoolId, createDto);

            expect(mockPrismaService.department.findUnique).toHaveBeenCalledWith({
                where: { schoolId_code: { schoolId, code: createDto.code } },
            });
            expect(mockPrismaService.department.create).toHaveBeenCalled();
            expect(result).toHaveProperty('id');
            expect(result.code).toEqual(createDto.code);
        });

        it('should throw ConflictException if code exists in school', async () => {
            mockPrismaService.department.findUnique.mockResolvedValue({ id: 2 });

            await expect(service.create(schoolId, createDto)).rejects.toThrow(ConflictException);
        });
    });

    describe('findAll', () => {
        const query: DepartmentQueryDto = { page: 1, limit: 10, search: 'Sci' };

        it('should return paginated departments', async () => {
            mockPrismaService.department.count.mockResolvedValue(1);
            mockPrismaService.department.findMany.mockResolvedValue([mockDepartment]);

            const result = await service.findAll(schoolId, query);

            expect(result.data).toEqual([mockDepartment]);
            expect(result.meta.total).toEqual(1);
            expect(mockPrismaService.department.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({ schoolId }),
            }));
        });
    });

    describe('findOne', () => {
        it('should return a department', async () => {
            mockPrismaService.department.findFirst.mockResolvedValue(mockDepartment);

            const result = await service.findOne(schoolId, departmentId);

            expect(result).toEqual(mockDepartment);
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

            // No code change, so no unique check
            const result = await service.update(schoolId, departmentId, { name: 'Updated Name' });

            expect(mockPrismaService.department.update).toHaveBeenCalled();
            expect(result.name).toEqual('Updated Name');
        });

        it('should throw ConflictException if updating code to existing one', async () => {
            mockPrismaService.department.findFirst.mockResolvedValue(mockDepartment);
            // Simulate another dept having the target code
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

            expect(mockPrismaService.department.delete).toHaveBeenCalledWith({ where: { id: departmentId } });
        });

        it('should throw BadRequestException if department has members', async () => {
            mockPrismaService.department.findFirst.mockResolvedValue({
                ...mockDepartment,
                _count: { members: 1, subjects: 0 },
            });

            await expect(service.remove(schoolId, departmentId)).rejects.toThrow(BadRequestException);
        });
    });
});
