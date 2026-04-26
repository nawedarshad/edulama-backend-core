import { Test, TestingModule } from '@nestjs/testing';
import { SectionService } from './section.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('SectionService', () => {
    let service: SectionService;
    let prisma: PrismaService;

    const mockPrismaService = {
        section: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
            count: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        },
        class: {
            findFirst: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
        },
        academicYear: {
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
                SectionService,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: EventEmitter2, useValue: mockEventEmitter },
            ],
        }).compile();

        service = module.get<SectionService>(SectionService);
        prisma = module.get<PrismaService>(PrismaService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('create', () => {
        it('should successfully create a section if capacity allows', async () => {
            const dto = { name: 'A', classId: 1, capacity: 30 };
            mockPrismaService.class.findFirst.mockResolvedValue({ id: 1, capacity: 100, sections: [] });
            mockPrismaService.section.create.mockResolvedValue({ id: 1, ...dto });

            const result = await service.create(1, dto as any, 1);
            expect(result.id).toBe(1);
        });

        it('should throw BadRequestException if capacity is exceeded', async () => {
            const dto = { name: 'B', classId: 1, capacity: 50 };
            mockPrismaService.class.findFirst.mockResolvedValue({ 
                id: 1, 
                capacity: 80, 
                sections: [{ capacity: 40 }] 
            });

            await expect(service.create(1, dto as any, 1)).rejects.toThrow(BadRequestException);
        });
    });

    describe('remove', () => {
        it('should throw exception if students are assigned', async () => {
            mockPrismaService.section.findFirst.mockResolvedValue({
                id: 1,
                _count: { StudentProfile: 5, ClassSubject: 0 }
            });

            await expect(service.remove(1, 1, 1)).rejects.toThrow(BadRequestException);
        });
    });
});
