import { Test, TestingModule } from '@nestjs/testing';
import { CalendarService } from './calendar.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DayType, AcademicYearStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('CalendarService', () => {
    let service: CalendarService;
    let prisma: PrismaService;

    const mockPrismaService = {
        workingPattern: {
            findMany: jest.fn(),
            upsert: jest.fn(),
            findUnique: jest.fn(),
            findFirst: jest.fn(),
        },
        calendarException: {
            findMany: jest.fn(),
            create: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            findFirst: jest.fn(),
        },
        academicYear: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            findFirst: jest.fn(),
        },
        class: {
            findFirst: jest.fn(),
        },
        $transaction: jest.fn((ops) => Promise.all(ops)),
    };
    const mockEventEmitter = { emit: jest.fn() };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CalendarService,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: EventEmitter2, useValue: mockEventEmitter },
            ],
        }).compile();

        service = module.get<CalendarService>(CalendarService);
        prisma = module.get<PrismaService>(PrismaService);

        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('generateCalendar', () => {
        it('should throw BadRequest if range > 2 years (DoS Protection)', async () => {
            const start = '2020-01-01';
            const end = '2023-01-01'; // 3 years
            await expect(service.generateCalendar(1, start, end)).rejects.toThrow(BadRequestException);
            await expect(service.generateCalendar(1, start, end)).rejects.toThrow('Date range cannot exceed 2 years');
        });

        it('should throw NotFound if classId does not belong to school (IDOR Protection)', async () => {
            mockPrismaService.class.findFirst.mockResolvedValue(null);
            await expect(service.generateCalendar(1, '2025-01-01', '2025-01-31', 999)).rejects.toThrow(NotFoundException);
        });

        it('should return empty list if no academic year found', async () => {
            mockPrismaService.academicYear.findMany.mockResolvedValue([]);
            const result = await service.generateCalendar(1, '2025-01-01', '2025-01-31');
            expect(result.days).toEqual([]);
        });

        it('should generate calendar days correctly', async () => {
            mockPrismaService.academicYear.findMany.mockResolvedValue([{
                id: 1,
                startDate: new Date('2025-01-01'),
                endDate: new Date('2025-12-31'),
                schoolId: 1
            }]);
            mockPrismaService.workingPattern.findMany.mockResolvedValue([
                { dayOfWeek: 'MONDAY', isWorking: true },
                { dayOfWeek: 'SATURDAY', isWorking: false } // Holiday
            ]);
            mockPrismaService.calendarException.findMany.mockResolvedValue([]);

            const result = await service.generateCalendar(1, '2025-01-01', '2025-01-05'); // Wed to Sun
            // Jan 1 2025 is Wednesday (Working)
            // Jan 4 2025 is Saturday (Holiday)

            expect(result.days.length).toBeGreaterThan(0);

            // Check Wednesday (Working)
            const wed = result.days.find(d => d.date === '2025-01-01');
            // Assuming default is Working if not in pattern, OR strict pattern. 
            // In service, "let isWorking = patternMap.get(dayOfWeek) ?? true" -> Default True
            expect(wed).toBeDefined();
            expect(wed!.type).toBe(DayType.WORKING);

            // Check Saturday (Holiday)
            const sat = result.days.find(d => d.date === '2025-01-04');
            expect(sat).toBeDefined();
            expect(sat!.type).toBe(DayType.HOLIDAY);
        });
    });

    describe('addException', () => {
        it('should throw BadRequest if date outside academic year', async () => {
            mockPrismaService.academicYear.findUnique.mockResolvedValue({
                id: 1, schoolId: 1, startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31')
            });
            const dto = { academicYearId: 1, date: '2026-01-01', title: 'Test', type: DayType.HOLIDAY }; // Outside
            await expect(service.addException(1, dto)).rejects.toThrow(BadRequestException);
        });

        it('should create exception if valid', async () => {
            mockPrismaService.academicYear.findUnique.mockResolvedValue({
                id: 1, schoolId: 1, startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31')
            });
            mockPrismaService.calendarException.create.mockResolvedValue({ id: 1 });

            const dto = { academicYearId: 1, date: '2025-06-01', title: 'Test', type: DayType.HOLIDAY };
            await service.addException(1, dto);
            expect(mockPrismaService.calendarException.create).toHaveBeenCalled();
        });
    });
});
