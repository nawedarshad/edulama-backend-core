import { Test, TestingModule } from '@nestjs/testing';
import { HouseService } from './house.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('HouseService', () => {
    let service: HouseService;
    let prisma: PrismaService;
    let eventEmitter: EventEmitter2;

    const mockPrisma = {
        house: {
            create: jest.fn(),
            findMany: jest.fn(),
            findFirst: jest.fn(),
            updateMany: jest.fn(),
            delete: jest.fn(),
        },
        teacherProfile: {
            findFirst: jest.fn(),
        },
        studentProfile: {
            findFirst: jest.fn(),
            count: jest.fn(),
        },
    };

    const mockEventEmitter = {
        emit: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                HouseService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: EventEmitter2, useValue: mockEventEmitter },
            ],
        }).compile();

        service = module.get<HouseService>(HouseService);
        prisma = module.get<PrismaService>(PrismaService);
        eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('create', () => {
        it('should create a house successfully', async () => {
            const dto = { name: 'Red House', color: '#FF0000' };
            (mockPrisma.house.create as jest.Mock).mockResolvedValue({ id: 1, ...dto });

            const result = await service.create(1, dto as any, 101);

            expect(result.name).toBe('Red House');
            expect(mockEventEmitter.emit).toHaveBeenCalledWith('audit.log', expect.anything());
        });

        it('should throw ConflictException if house name exists', async () => {
            (mockPrisma.house.create as jest.Mock).mockRejectedValue({ code: 'P2002' });
            await expect(service.create(1, { name: 'Red' } as any, 101)).rejects.toThrow(ConflictException);
        });
    });

    describe('remove', () => {
        it('should throw ConflictException if house has assigned students', async () => {
            (mockPrisma.house.findFirst as jest.Mock).mockResolvedValue({ id: 1, name: 'Red' });
            (mockPrisma.studentProfile.count as jest.Mock).mockResolvedValue(5);

            await expect(service.remove(1, 1, 101)).rejects.toThrow(ConflictException);
        });

        it('should delete house if empty', async () => {
            (mockPrisma.house.findFirst as jest.Mock).mockResolvedValue({ id: 1, name: 'Red' });
            (mockPrisma.studentProfile.count as jest.Mock).mockResolvedValue(0);
            (mockPrisma.house.delete as jest.Mock).mockResolvedValue({ id: 1 });

            const result = await service.remove(1, 1, 101);
            expect(result.message).toContain('successfully');
            expect(mockPrisma.house.delete).toHaveBeenCalled();
        });
    });
});
