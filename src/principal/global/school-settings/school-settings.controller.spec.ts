import { Test, TestingModule } from '@nestjs/testing';
import { SchoolSettingsController } from './school-settings.controller';
import { SchoolSettingsService } from './school-settings.service';
import { UpdateSchoolSettingsDto } from './dto/update-school-settings.dto';
import { PrincipalAuthGuard } from '../../../common/guards/principal.guard';
import { ExecutionContext } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';

describe('SchoolSettingsController', () => {
    let controller: SchoolSettingsController;
    let service: SchoolSettingsService;

    const mockService = {
        getSettings: jest.fn(),
        updateSettings: jest.fn(),
    };

    const mockHttpService = {};
    const mockConfigService = {};

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [SchoolSettingsController],
            providers: [
                {
                    provide: SchoolSettingsService,
                    useValue: mockService,
                },
                {
                    provide: HttpService,
                    useValue: mockHttpService,
                },
                {
                    provide: ConfigService,
                    useValue: mockConfigService,
                },
            ],
        })
            .overrideGuard(PrincipalAuthGuard)
            .useValue({
                canActivate: (context: ExecutionContext) => {
                    const req = context.switchToHttp().getRequest();
                    req.user = { schoolId: 1, id: 101, role: 'PRINCIPAL' };
                    return true;
                },
            })
            .compile();

        controller = module.get<SchoolSettingsController>(SchoolSettingsController);
        service = module.get<SchoolSettingsService>(SchoolSettingsService);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('getSettings', () => {
        it('should return settings', async () => {
            const mockResult = { id: 1, schoolId: 1 };
            (service.getSettings as jest.Mock).mockResolvedValue(mockResult);

            const result = await controller.getSettings({ user: { schoolId: 1 } });
            expect(result).toEqual(mockResult);
            expect(service.getSettings).toHaveBeenCalledWith(1);
        });
    });

    describe('updateSettings', () => {
        it('should call updateSettings with correct params', async () => {
            const dto: UpdateSchoolSettingsDto = { motto: 'Test' };
            const mockResult = { id: 1, ...dto };
            (service.updateSettings as jest.Mock).mockResolvedValue(mockResult);

            const req = { user: { schoolId: 1, id: 101 } };
            const result = await controller.updateSettings(req, dto);

            expect(result).toEqual(mockResult);
            expect(service.updateSettings).toHaveBeenCalledWith(1, 101, dto);
        });
    });
});
