
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

// Mock Service
const mockService = {
    generateCalendar: jest.fn().mockResolvedValue({ days: [], meta: { message: "Success" } }),
};

describe('CalendarController Manual Logic Test', () => {
    let controller: CalendarController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [CalendarController],
            providers: [
                { provide: CalendarService, useValue: mockService },
            ],
        }).compile();

        controller = module.get<CalendarController>(CalendarController);
    });

    it('should handle startDate/endDate without month/year', async () => {
        // Mock params
        const req = { user: { schoolId: 1 } };
        const month = undefined;
        const year = undefined;
        const startDate = "2026-01-01";
        const endDate = "2026-01-31";
        const classId = undefined;

        await controller.generateCalendar(req, month, year, startDate, endDate, classId);

        expect(mockService.generateCalendar).toHaveBeenCalledWith(1, "2026-01-01", "2026-01-31", undefined);
    });

    it('should throw 400 if neither provided', async () => {
        const req = { user: { schoolId: 1 } };
        try {
            await controller.generateCalendar(req, undefined, undefined, undefined, undefined, undefined);
            console.error("DID NOT THROW ERROR!");
            throw new Error("Should have thrown BadRequestException");
        } catch (e) {
            console.log("Caught Error:", e);
            if (e.message === "Should have thrown BadRequestException") throw e;
            expect(e).toBeInstanceOf(BadRequestException);
        }
    });

    it('should throw 400 if empty strings provided', async () => {
        const req = { user: { schoolId: 1 } };
        try {
            // @ts-ignore
            await controller.generateCalendar(req, undefined, undefined, "", "", undefined);
            console.error("DID NOT THROW ERROR (Empty Strings)!");
            throw new Error("Should have thrown BadRequestException for empty strings");
        } catch (e) {
            console.log("Caught Error (Empty Strings):", e);
            if (e.message.includes("Should have thrown")) throw e;
            expect(e).toBeInstanceOf(BadRequestException);
        }
    });
});
