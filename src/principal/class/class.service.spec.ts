import { Test, TestingModule } from '@nestjs/testing';
import { ClassService } from './class.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('ClassService', () => {
    let service: ClassService;
    let prisma: PrismaService;

    const mockPrismaService = {
        class: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            count: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            aggregate: jest.fn(),
        },
        section: {
            count: jest.fn(),
            aggregate: jest.fn(),
            createMany: jest.fn(),
        },
        studentProfile: {
            count: jest.fn(),
        },
        school: {
            findUnique: jest.fn(),
        },
        schedule: {
            findFirst: jest.fn(),
        },
        $transaction: jest.fn((cb) => cb(mockPrismaService)),
    };

    const mockEventEmitter = {
        emit: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ClassService,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: EventEmitter2, useValue: mockEventEmitter },
            ],
        }).compile();

        service = module.get<ClassService>(ClassService);
        prisma = module.get<PrismaService>(PrismaService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('findAll', () => {
        it('should return paginated classes with analytics', async () => {
            mockPrismaService.class.findMany.mockResolvedValue([]);
            mockPrismaService.class.count.mockResolvedValue(0);
            mockPrismaService.section.count.mockResolvedValue(0);
            mockPrismaService.studentProfile.count.mockResolvedValue(0);
            mockPrismaService.section.aggregate.mockResolvedValue({ _sum: { capacity: 0 } });

            const result = await service.findAll(1);
            expect(result.data).toEqual([]);
            expect(result.meta.total).toBe(0);
        });
    });

    describe('create', () => {
        it('should create a new class', async () => {
            const dto = { name: 'Class 1', stage: 'PRIMARY' as any };
            mockPrismaService.class.create.mockResolvedValue({ id: 1, ...dto });

            const result = await service.create(1, dto as any, 1);
            expect(result.id).toBe(1);
            expect(mockEventEmitter.emit).toHaveBeenCalled();
        });

        it('should throw BadRequestException if class exists (P2002)', async () => {
            const dto = { name: 'Class 1' };
            mockPrismaService.class.create.mockRejectedValue({ code: 'P2002' });

            await expect(service.create(1, dto as any, 1)).rejects.toThrow(BadRequestException);
        });
    });

    describe('remove', () => {
        it('should delete class if it has no sections or students', async () => {
            mockPrismaService.class.findFirst.mockResolvedValue({
                id: 1,
                sections: [],
                _count: { StudentProfile: 0 }
            });
            mockPrismaService.class.delete.mockResolvedValue({ id: 1 });

            await service.remove(1, 1, 1);
            expect(mockPrismaService.class.delete).toHaveBeenCalled();
        });

        it('should throw BadRequestException if class has sections', async () => {
            mockPrismaService.class.findFirst.mockResolvedValue({
                id: 1,
                sections: [{ id: 1 }],
                _count: { StudentProfile: 0 }
            });

            await expect(service.remove(1, 1, 1)).rejects.toThrow(BadRequestException);
        });
    });
});
