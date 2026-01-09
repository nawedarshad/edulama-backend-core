import { Test, TestingModule } from '@nestjs/testing';
import { SubjectController } from './subject.controller';
import { SubjectService } from './subject.service';
import { CreateSubjectDto, UpdateSubjectDto } from './dto/subject.dto';

import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { ConfigService } from '@nestjs/config';

describe('SubjectController', () => {
    let controller: SubjectController;
    let service: SubjectService;

    const mockSubjectService = {
        getStats: jest.fn(),
        exportSubjects: jest.fn(),
        exportClassSubjects: jest.fn(),
        createCategory: jest.fn(),
        findAllCategories: jest.fn(),
        updateCategory: jest.fn(),
        removeCategory: jest.fn(),
        create: jest.fn(),
        findAll: jest.fn(),
        findOne: jest.fn(),
        update: jest.fn(),
        remove: jest.fn(),
        assignToClass: jest.fn(),
        getClassSubjects: jest.fn(),
        updateClassSubject: jest.fn(),
        removeClassSubject: jest.fn(),
    };

    const mockUser = { schoolId: 1, id: 99 };
    const mockRequest = { user: mockUser };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [SubjectController],
            providers: [
                {
                    provide: SubjectService,
                    useValue: mockSubjectService,
                },
                {
                    provide: ConfigService,
                    useValue: { get: jest.fn() },
                }
            ],
        })
            .overrideGuard(PrincipalAuthGuard)
            .useValue({ canActivate: jest.fn(() => true) })
            .compile();

        controller = module.get<SubjectController>(SubjectController);
        service = module.get<SubjectService>(SubjectService);
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('create', () => {
        it('should call service.create with schoolId', async () => {
            const dto: CreateSubjectDto = { name: 'Math', code: 'MATH' };
            await controller.create(mockRequest, dto);
            expect(service.create).toHaveBeenCalledWith(mockUser.schoolId, dto);
        });
    });

    describe('findAll', () => {
        it('should call service.findAll with schoolId', async () => {
            await controller.findAll(mockRequest, {});
            expect(service.findAll).toHaveBeenCalledWith(mockUser.schoolId, {});
        });
    });

    describe('getStats', () => {
        it('should call service.getStats', async () => {
            await controller.getStats(mockRequest);
            expect(service.getStats).toHaveBeenCalledWith(mockUser.schoolId);
        });
    });
});
