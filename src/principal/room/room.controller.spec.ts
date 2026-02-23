import { Test, TestingModule } from '@nestjs/testing';
import { RoomController } from './room.controller';
import { RoomService } from './room.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { RoomType, RoomStatus } from '@prisma/client';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { CanActivate } from '@nestjs/common';
import { ModuleGuard } from '../../common/guards/module.guard';

const mockRoomService = {
    findAll: jest.fn(),
    getTemplate: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    assignRoom: jest.fn(),
    unassignRoom: jest.fn(),
    bulkCreate: jest.fn(),
};

const mockGuard: CanActivate = { canActivate: jest.fn(() => true) };

describe('RoomController', () => {
    let controller: RoomController;
    let service: RoomService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [RoomController],
            providers: [
                { provide: RoomService, useValue: mockRoomService },
            ],
        })
            .overrideGuard(PrincipalAuthGuard)
            .useValue(mockGuard)
            .overrideGuard(ModuleGuard)
            .useValue(mockGuard)
            .compile();

        controller = module.get<RoomController>(RoomController);
        service = module.get<RoomService>(RoomService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('findAll', () => {
        it('should call service.findAll with correct params', async () => {
            const req = { user: { schoolId: 1 } };
            const query = { page: 1, limit: 10 };
            const expectedResult = { rooms: [], pagination: { total: 0 } };
            (service.findAll as jest.Mock).mockResolvedValue(expectedResult);

            const result = await controller.findAll(req, query as any);
            expect(result).toBe(expectedResult);
            expect(service.findAll).toHaveBeenCalledWith(1, query);
        });
    });

    describe('getTemplate', () => {
        it('should return template', async () => {
            (service.getTemplate as jest.Mock).mockReturnValue([]);
            const result = await controller.getTemplate();
            expect(result).toEqual([]);
            expect(service.getTemplate).toHaveBeenCalled();
        });
    });

    describe('create', () => {
        it('should create room', async () => {
            const req = { user: { schoolId: 1 } };
            const dto: CreateRoomDto = { name: 'Lab', roomType: RoomType.LAB };
            (service.create as jest.Mock).mockResolvedValue({ id: 1, ...dto });

            const result = await controller.create(req, dto);
            expect(result).toEqual({ id: 1, ...dto });
            expect(service.create).toHaveBeenCalledWith(1, dto);
        });
    });

    describe('findOne', () => {
        it('should return one room', async () => {
            const req = { user: { schoolId: 1 } };
            (service.findOne as jest.Mock).mockResolvedValue({ id: 1 });

            const result = await controller.findOne(req, 1);
            expect(result).toEqual({ id: 1 });
            expect(service.findOne).toHaveBeenCalledWith(1, 1);
        });
    });

    describe('update', () => {
        it('should update room', async () => {
            const req = { user: { schoolId: 1 } };
            const dto = { name: 'New Name' };
            (service.update as jest.Mock).mockResolvedValue({ id: 1, ...dto });

            const result = await controller.update(req, 1, dto);
            expect(result.name).toBe('New Name');
            expect(service.update).toHaveBeenCalledWith(1, 1, dto);
        });
    });

    describe('remove', () => {
        it('should remove room', async () => {
            const req = { user: { schoolId: 1 } };
            (service.remove as jest.Mock).mockResolvedValue({ message: 'Deleted' });

            const result = await controller.remove(req, 1);
            expect(result).toEqual({ message: 'Deleted' });
            expect(service.remove).toHaveBeenCalledWith(1, 1);
        });
    });

    describe('assignRoom', () => {
        it('should assign room', async () => {
            const req = { user: { schoolId: 1 } };
            const dto = { roomId: 1, sectionId: 1, isActive: true };
            (service.assignRoom as jest.Mock).mockResolvedValue({ id: 1 });

            const result = await controller.assignRoom(req, dto);
            expect(service.assignRoom).toHaveBeenCalledWith(1, dto);
        });
    });

    describe('unassignRoom', () => {
        it('should unassign room', async () => {
            const req = { user: { schoolId: 1 } };
            (service.unassignRoom as jest.Mock).mockResolvedValue({ message: 'Unassigned' });

            const result = await controller.unassignRoom(req, 1, 1);
            expect(service.unassignRoom).toHaveBeenCalledWith(1, 1, 1);
        });
    });

    describe('bulkCreate', () => {
        it('should bulk create rooms', async () => {
            const req = { user: { schoolId: 1 } };
            const dto = { rooms: [] };
            (service.bulkCreate as jest.Mock).mockResolvedValue({ count: 5 });

            const result = await controller.bulkCreate(req, dto);
            expect(result).toEqual({ count: 5 });
            expect(service.bulkCreate).toHaveBeenCalledWith(1, dto);
        });
    });
});
