import { Test, TestingModule } from '@nestjs/testing';
import { RoomService } from './room.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { RoomType, RoomStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

const mockPrismaService = {
    room: {
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        createMany: jest.fn(),
    },
    section: {
        findFirst: jest.fn(),
    },
    academicYear: {
        findFirst: jest.fn(),
    },
    roomAssignment: {
        upsert: jest.fn(),
        deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
};

const mockEventEmitter = {
    emit: jest.fn(),
};

describe('RoomService', () => {
    let service: RoomService;
    let prisma: PrismaService;
    let eventEmitter: EventEmitter2;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RoomService,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: EventEmitter2, useValue: mockEventEmitter },
            ],
        }).compile();

        service = module.get<RoomService>(RoomService);
        prisma = module.get<PrismaService>(PrismaService);
        eventEmitter = module.get<EventEmitter2>(EventEmitter2);

        // Mock Logger to prevent console noise during negative tests
        jest.spyOn((service as any).logger, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('create', () => {
        it('should create a room and emit audit log', async () => {
            const dto = { name: 'Lab 1', roomType: RoomType.LAB };
            const mockRoom = { id: 1, ...dto, schoolId: 1 };
            (prisma.room.create as jest.Mock).mockResolvedValue(mockRoom);

            const result = await service.create(1, dto as any, 101);

            expect(result).toEqual(mockRoom);
            expect(prisma.room.create).toHaveBeenCalled();
            expect(eventEmitter.emit).toHaveBeenCalledWith('audit.log', expect.anything());
        });
    });

    describe('remove (Safe Delete)', () => {
        it('should delete a room if no active assignments', async () => {
            (prisma.room.findFirst as jest.Mock).mockResolvedValue({ id: 1, name: 'Room 1', assignments: [] });
            (prisma.room.delete as jest.Mock).mockResolvedValue({ id: 1 });

            await service.remove(1, 1, 101);
            expect(prisma.room.delete).toHaveBeenCalledWith({ where: { id: 1 } });
            expect(eventEmitter.emit).toHaveBeenCalledWith('audit.log', expect.anything());
        });

        it('should throw BadRequestException if room has active assignments', async () => {
            (prisma.room.findFirst as jest.Mock).mockResolvedValue({
                id: 1,
                assignments: [{ id: 1, isActive: true }],
            });

            await expect(service.remove(1, 1, 101)).rejects.toThrow(BadRequestException);
            expect(prisma.room.delete).not.toHaveBeenCalled();
        });
    });

    describe('assignRoom', () => {
        it('should assign room successfully and emit audit', async () => {
            (prisma.room.findFirst as jest.Mock).mockResolvedValue({ id: 1 });
            (prisma.section.findFirst as jest.Mock).mockResolvedValue({ id: 1 });
            (prisma.academicYear.findFirst as jest.Mock).mockResolvedValue({ id: 2024 });
            (prisma.roomAssignment.upsert as jest.Mock).mockResolvedValue({ id: 1 });

            await service.assignRoom(1, { roomId: 1, sectionId: 1 }, 101);
            expect(prisma.roomAssignment.upsert).toHaveBeenCalled();
            expect(eventEmitter.emit).toHaveBeenCalledWith('audit.log', expect.anything());
        });
    });
});
