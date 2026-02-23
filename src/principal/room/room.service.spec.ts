import { Test, TestingModule } from '@nestjs/testing';
import { RoomService } from './room.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { RoomType, RoomStatus } from '@prisma/client';

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

describe('RoomService', () => {
    let service: RoomService;
    let prisma: PrismaService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RoomService,
                { provide: PrismaService, useValue: mockPrismaService },
            ],
        }).compile();

        service = module.get<RoomService>(RoomService);
        prisma = module.get<PrismaService>(PrismaService);

        // Mock Logger to prevent console noise during negative tests
        jest.spyOn((service as any).logger, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('findAll', () => {
        it('should return paginated rooms with filtering', async () => {
            const mockRooms = [
                {
                    id: 1,
                    name: 'Room 1',
                    assignments: [],
                    status: RoomStatus.ACTIVE,
                    roomType: RoomType.CLASSROOM,
                    capacity: 30,
                    facilities: [],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ];
            const mockCount = 1;

            (prisma.room.findMany as jest.Mock).mockResolvedValue(mockRooms);
            (prisma.room.count as jest.Mock).mockResolvedValue(mockCount);

            const result = await service.findAll(1, { page: 1, limit: 10, search: 'Room' });

            expect(result.rooms).toHaveLength(1);
            expect(result.pagination.total).toBe(1);
            expect(prisma.room.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({
                    AND: expect.arrayContaining([
                        expect.objectContaining({
                            OR: expect.arrayContaining([
                                { name: { contains: 'Room', mode: 'insensitive' } },
                            ]),
                        }),
                    ]),
                }),
            }));
        });
    });

    describe('create', () => {
        it('should create a room successfully', async () => {
            const dto = { name: 'Lab 1', roomType: RoomType.LAB };
            const mockRoom = { id: 1, ...dto, schoolId: 1 };
            (prisma.room.create as jest.Mock).mockResolvedValue(mockRoom);

            const result = await service.create(1, dto as any);

            expect(result).toEqual(mockRoom);
            expect(prisma.room.create).toHaveBeenCalled();
        });

        it('should throw BadRequestException on duplicate code', async () => {
            (prisma.room.create as jest.Mock).mockRejectedValue({ code: 'P2002' });
            await expect(service.create(1, { name: 'Lab', roomType: RoomType.LAB } as any)).rejects.toThrow(BadRequestException);
        });
    });

    describe('findOne', () => {
        it('should return a room if found', async () => {
            const mockRoom = { id: 1, assignments: [] };
            (prisma.room.findFirst as jest.Mock).mockResolvedValue(mockRoom);

            const result = await service.findOne(1, 1);
            expect(result.id).toBe(1);
        });

        it('should throw NotFoundException if not found', async () => {
            (prisma.room.findFirst as jest.Mock).mockResolvedValue(null);
            await expect(service.findOne(1, 99)).rejects.toThrow(NotFoundException);
        });
    });

    describe('update', () => {
        it('should update a room successfully', async () => {
            (prisma.room.findFirst as jest.Mock).mockResolvedValue({ id: 1 });
            (prisma.room.update as jest.Mock).mockResolvedValue({ id: 1, name: 'Updated' });

            const result = await service.update(1, 1, { name: 'Updated' });
            expect(result.name).toBe('Updated');
        });

        it('should throw NotFoundException if room does not exist', async () => {
            (prisma.room.findFirst as jest.Mock).mockResolvedValue(null);
            await expect(service.update(1, 99, {})).rejects.toThrow(NotFoundException);
        });
    });

    describe('remove (Safe Delete)', () => {
        it('should delete a room if no active assignments', async () => {
            (prisma.room.findFirst as jest.Mock).mockResolvedValue({ id: 1, assignments: [] });
            (prisma.room.delete as jest.Mock).mockResolvedValue({ id: 1 });

            await service.remove(1, 1);
            expect(prisma.room.delete).toHaveBeenCalledWith({ where: { id: 1 } });
        });

        it('should throw BadRequestException if room has active assignments', async () => {
            (prisma.room.findFirst as jest.Mock).mockResolvedValue({
                id: 1,
                assignments: [{ id: 1, isActive: true }],
            });

            await expect(service.remove(1, 1)).rejects.toThrow(BadRequestException);
            expect(prisma.room.delete).not.toHaveBeenCalled();
        });
    });

    describe('assignRoom', () => {
        it('should assign room successfully', async () => {
            (prisma.room.findFirst as jest.Mock).mockResolvedValue({ id: 1 });
            (prisma.section.findFirst as jest.Mock).mockResolvedValue({ id: 1, academicYearId: 2024 });
            (prisma.academicYear.findFirst as jest.Mock).mockResolvedValue({ id: 2024 });
            (prisma.roomAssignment.upsert as jest.Mock).mockResolvedValue({ id: 1 });

            await service.assignRoom(1, { roomId: 1, sectionId: 1 });
            expect(prisma.roomAssignment.upsert).toHaveBeenCalled();
        });

        it('should throw NotFoundException if room or section missing', async () => {
            (prisma.room.findFirst as jest.Mock).mockResolvedValue(null);
            await expect(service.assignRoom(1, { roomId: 1, sectionId: 1 })).rejects.toThrow(NotFoundException);
        });
    });

    describe('bulkCreate (Transactional)', () => {
        it('should use transaction for bulk creation', async () => {
            const dto = { rooms: [{ name: 'R1', roomType: RoomType.CLASSROOM }] };

            // Mock transaction execution
            (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
                return callback(mockPrismaService); // Pass the mock as the transaction client
            });
            (mockPrismaService.room.createMany as jest.Mock).mockResolvedValue({ count: 1 });

            const result = await service.bulkCreate(1, dto as any);

            expect(prisma.$transaction).toHaveBeenCalled();
            expect(result.count).toBe(1);
        });

        it('should rollback on error', async () => {
            (prisma.$transaction as jest.Mock).mockRejectedValue(new Error('DB Error'));
            await expect(service.bulkCreate(1, { rooms: [] })).rejects.toThrow(InternalServerErrorException);
        });
    });
});
