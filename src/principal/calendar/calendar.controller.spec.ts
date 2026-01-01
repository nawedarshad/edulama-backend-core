import { Test, TestingModule } from '@nestjs/testing';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';

describe('CalendarController', () => {
    let controller: CalendarController;
    let service: CalendarService;

    const mockCalendarService = {
        getWorkingPattern: jest.fn(),
        setWorkingPattern: jest.fn(),
        getExceptions: jest.fn(),
        addException: jest.fn(),
        updateException: jest.fn(),
        deleteException: jest.fn(),
        generateCalendar: jest.fn(),
        getStats: jest.fn(),
        validateDate: jest.fn(),
    };

    const mockHttpService = {};
    const mockConfigService = {};

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [CalendarController],
            providers: [
                { provide: CalendarService, useValue: mockCalendarService },
                { provide: HttpService, useValue: mockHttpService },
                { provide: ConfigService, useValue: mockConfigService },
            ],
        }).compile();

        controller = module.get<CalendarController>(CalendarController);
        service = module.get<CalendarService>(CalendarService);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('generateCalendar', () => {
        it('should call service with correct parameters for range query', async () => {
            const req = { user: { schoolId: 1 } };
            const startDate = '2025-01-01';
            const endDate = '2025-01-31';

            await controller.generateCalendar(req, undefined, undefined, startDate, endDate);

            expect(service.generateCalendar).toHaveBeenCalledWith(1, startDate, endDate, undefined);
        });

        it('should convert backward compatible month/year to range', async () => {
            const req = { user: { schoolId: 1 } };
            // Month 1 (Jan), Year 2025
            await controller.generateCalendar(req, 1, 2025);

            // Expect Jan 1 to Jan 31
            expect(service.generateCalendar).toHaveBeenCalledWith(1, '2025-01-01', '2025-01-31', undefined);
        });
    });

    describe('getStats', () => {
        it('should call service.getStats', async () => {
            const req = { user: { schoolId: 1 } };
            await controller.getStats(req, '2025-01-01', '2025-12-31');
            expect(service.getStats).toHaveBeenCalledWith(1, '2025-01-01', '2025-12-31', undefined);
        });
    });
});
