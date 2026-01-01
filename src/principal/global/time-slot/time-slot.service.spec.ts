import { Test, TestingModule } from '@nestjs/testing';
import { TimeSlotService } from './time-slot.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DayOfWeek, AcademicYearStatus } from '@prisma/client';

describe('TimeSlotService', () => {
    let service: TimeSlotService;
    let prisma: PrismaService;

    const mockPrismaService = {
        timeSlot: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        },
        academicYear: {
            findFirst: jest.fn(),
        },
        timePeriod: {
            findFirst: jest.fn(),
            create: jest.fn(),
        },
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TimeSlotService,
                { provide: PrismaService, useValue: mockPrismaService },
            ],
        }).compile();

        service = module.get<TimeSlotService>(TimeSlotService);
        prisma = module.get<PrismaService>(PrismaService);
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('create with overlap validation', () => {
        it('should throw BadRequest if slot overlaps existing one', async () => {
            // Mock Active Year
            mockPrismaService.academicYear.findFirst.mockResolvedValue({ id: 1 });

            // Mock Period finding
            const newPeriod = { id: 2, startTime: new Date('2025-01-01T09:00:00Z'), endTime: new Date('2025-01-01T10:00:00Z'), name: 'P1' };
            mockPrismaService.timePeriod.findFirst.mockResolvedValue(newPeriod);

            // Mock Finding Existing Slots for validation
            // Existing slot: 09:30 - 10:30 (Overlaps 09:00-10:00)
            mockPrismaService.timeSlot.findMany.mockResolvedValue([
                {
                    id: 100,
                    period: {
                        startTime: new Date('2025-01-01T09:30:00Z'),
                        endTime: new Date('2025-01-01T10:30:00Z'),
                        name: 'Existing'
                    }
                }
            ]);

            const dto = { day: DayOfWeek.MONDAY, periodId: 2, description: 'Test' };

            await expect(service.create(1, dto)).rejects.toThrow(BadRequestException);
            await expect(service.create(1, dto)).rejects.toThrow(/overlaps/);
        });

        it('should create if no overlap', async () => {
            // Mock Active Year
            mockPrismaService.academicYear.findFirst.mockResolvedValue({ id: 1 });

            // Mock Period finding
            const newPeriod = { id: 2, startTime: new Date('2025-01-01T09:00:00Z'), endTime: new Date('2025-01-01T10:00:00Z'), name: 'P1' };
            mockPrismaService.timePeriod.findFirst.mockResolvedValue(newPeriod);

            // No existing slots
            mockPrismaService.timeSlot.findMany.mockResolvedValue([]);

            mockPrismaService.timeSlot.create.mockResolvedValue({ id: 1 });

            const dto = { day: DayOfWeek.MONDAY, periodId: 2, description: 'Test' };
            await service.create(1, dto);
            expect(mockPrismaService.timeSlot.create).toHaveBeenCalled();
        });
    });
});
