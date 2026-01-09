import { Test, TestingModule } from '@nestjs/testing';
import { DepartmentController } from './department.controller';
import { DepartmentService } from './department.service';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { CreateDepartmentDto, DepartmentQueryDto } from './dto/department.dto';

describe('DepartmentController', () => {
    let controller: DepartmentController;
    let service: DepartmentService;

    const mockDepartmentService = {
        create: jest.fn(),
        findAll: jest.fn(),
        findOne: jest.fn(),
        update: jest.fn(),
        remove: jest.fn(),
        addMember: jest.fn(),
        getMembers: jest.fn(),
        updateMember: jest.fn(),
        removeMember: jest.fn(),
    };

    const mockReq = {
        user: { schoolId: 1, id: 100, role: 'PRINCIPAL' },
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [DepartmentController],
            providers: [
                { provide: DepartmentService, useValue: mockDepartmentService },
                // Override guard
                { provide: PrincipalAuthGuard, useValue: { canActivate: () => true } },
            ],
        })
            .overrideGuard(PrincipalAuthGuard)
            .useValue({ canActivate: () => true })
            .compile();

        controller = module.get<DepartmentController>(DepartmentController);
        service = module.get<DepartmentService>(DepartmentService);

        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('create', () => {
        it('should call service.create with correct args', async () => {
            const dto: CreateDepartmentDto = { code: 'A', name: 'B' };
            await controller.create(mockReq, dto);
            expect(service.create).toHaveBeenCalledWith(mockReq.user.schoolId, dto);
        });
    });

    describe('findAll', () => {
        it('should call service.findAll with correct args', async () => {
            const query: DepartmentQueryDto = { page: 1 };
            await controller.findAll(mockReq, query);
            expect(service.findAll).toHaveBeenCalledWith(mockReq.user.schoolId, query);
        });
    });

    describe('findOne', () => {
        it('should call service.findOne with correct args', async () => {
            await controller.findOne(mockReq, 1);
            expect(service.findOne).toHaveBeenCalledWith(mockReq.user.schoolId, 1);
        });
    });
});
