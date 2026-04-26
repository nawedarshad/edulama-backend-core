import { Test, TestingModule } from '@nestjs/testing';
import { DepartmentController } from './department.controller';
import { DepartmentService } from './department.service';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { ModuleGuard } from '../../common/guards/module.guard';
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
        addMembersBulk: jest.fn(),
        assignSubjectsBulk: jest.fn(),
        getSubjects: jest.fn(),
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
            .overrideGuard(ModuleGuard)
            .useValue({ canActivate: () => true })
            .compile();

        controller = module.get<DepartmentController>(DepartmentController);
        service = module.get<DepartmentService>(DepartmentService);

        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('Core Operations', () => {
        it('create: should call service.create', async () => {
            const dto: CreateDepartmentDto = { code: 'A', name: 'B' };
            await controller.create(mockReq, dto);
            expect(service.create).toHaveBeenCalledWith(mockReq.user.schoolId, dto);
        });

        it('findAll: should call service.findAll', async () => {
            const query: DepartmentQueryDto = { page: 1 };
            await controller.findAll(mockReq, query);
            expect(service.findAll).toHaveBeenCalledWith(mockReq.user.schoolId, query);
        });

        it('findOne: should call service.findOne', async () => {
            await controller.findOne(mockReq, 1);
            expect(service.findOne).toHaveBeenCalledWith(mockReq.user.schoolId, 1);
        });

        it('update: should call service.update', async () => {
            const dto = { name: 'Updated' };
            await controller.update(mockReq, 1, dto);
            expect(service.update).toHaveBeenCalledWith(mockReq.user.schoolId, 1, dto);
        });

        it('remove: should call service.remove', async () => {
            await controller.remove(mockReq, 1);
            expect(service.remove).toHaveBeenCalledWith(mockReq.user.schoolId, 1);
        });
    });

    describe('Member Operations', () => {
        it('getMembers: should call service.getMembers', async () => {
            await controller.getMembers(mockReq, 1, {});
            expect(service.getMembers).toHaveBeenCalledWith(mockReq.user.schoolId, 1, {});
        });

        it('addMember: should call service.addMember', async () => {
            const dto = { userId: 2, role: 'TEACHER' } as any;
            await controller.addMember(mockReq, 1, dto);
            expect(service.addMember).toHaveBeenCalledWith(mockReq.user.schoolId, 1, dto);
        });

        it('addMembersBulk: should call service.addMembersBulk', async () => {
            const dto = { userIds: [2], role: 'TEACHER' } as any;
            await controller.addMembersBulk(mockReq, 1, dto);
            expect(service.addMembersBulk).toHaveBeenCalledWith(mockReq.user.schoolId, 1, dto);
        });

        it('updateMember: should call service.updateMember', async () => {
            const dto = { role: 'HOD' } as any;
            await controller.updateMember(mockReq, 1, 2, dto);
            expect(service.updateMember).toHaveBeenCalledWith(mockReq.user.schoolId, 1, 2, dto);
        });

        it('removeMember: should call service.removeMember', async () => {
            await controller.removeMember(mockReq, 1, 2);
            expect(service.removeMember).toHaveBeenCalledWith(mockReq.user.schoolId, 1, 2);
        });
    });

    describe('Subject Operations', () => {
        it('getSubjects: should call service.getSubjects', async () => {
            await controller.getSubjects(mockReq, 1, {});
            expect(service.getSubjects).toHaveBeenCalledWith(mockReq.user.schoolId, 1, {});
        });

        it('assignSubjectsBulk: should call service.assignSubjectsBulk', async () => {
            const dto = { subjectIds: [1] };
            await controller.assignSubjectsBulk(mockReq, 1, dto);
            expect(service.assignSubjectsBulk).toHaveBeenCalledWith(mockReq.user.schoolId, 1, dto);
        });
    });
});
