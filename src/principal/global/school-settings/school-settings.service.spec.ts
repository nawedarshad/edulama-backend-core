import { Test, TestingModule } from '@nestjs/testing';
import { SchoolSettingsService } from './school-settings.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditLogService } from '../../../common/audit/audit-log.service';
import { UpdateSchoolSettingsDto } from './dto/update-school-settings.dto';
import { plainToInstance } from 'class-transformer'; // Needed to test DTO transform

describe('SchoolSettingsService', () => {
    let service: SchoolSettingsService;
    let prisma: PrismaService;
    let auditLogService: AuditLogService;

    const mockPrismaService = {
        schoolSettings: {
            findUnique: jest.fn(),
            create: jest.fn(),
            upsert: jest.fn(),
        },
    };

    const mockAuditLogService = {
        createLog: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SchoolSettingsService,
                {
                    provide: PrismaService,
                    useValue: mockPrismaService,
                },
                {
                    provide: AuditLogService,
                    useValue: mockAuditLogService,
                },
            ],
        }).compile();

        service = module.get<SchoolSettingsService>(SchoolSettingsService);
        prisma = module.get<PrismaService>(PrismaService);
        auditLogService = module.get<AuditLogService>(AuditLogService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('getSettings', () => {
        it('should return existing settings', async () => {
            const mockSettings = { id: 1, schoolId: 1, motto: 'Test' };
            (prisma.schoolSettings.findUnique as jest.Mock).mockResolvedValue(mockSettings);

            const result = await service.getSettings(1);
            expect(result).toEqual(mockSettings);
            expect(prisma.schoolSettings.findUnique).toHaveBeenCalledWith({ where: { schoolId: 1 } });
        });

        it('should create default settings if not found', async () => {
            (prisma.schoolSettings.findUnique as jest.Mock).mockResolvedValue(null);
            const defaultSettings = { id: 1, schoolId: 1, attendanceMode: 'DAILY' };
            (prisma.schoolSettings.create as jest.Mock).mockResolvedValue(defaultSettings);

            const result = await service.getSettings(1);
            expect(result).toEqual(defaultSettings);
            expect(prisma.schoolSettings.create).toHaveBeenCalled();
        });
    });

    describe('updateSettings', () => {
        it('should upsert settings and log audit event', async () => {
            const dto: UpdateSchoolSettingsDto = { motto: 'New Motto' };
            const updatedSettings = { id: 1, schoolId: 1, ...dto };
            (prisma.schoolSettings.upsert as jest.Mock).mockResolvedValue(updatedSettings);

            const result = await service.updateSettings(1, 101, dto, '1.2.3.4');

            expect(result).toEqual(updatedSettings);
            expect(prisma.schoolSettings.upsert).toHaveBeenCalled();
            expect(auditLogService.createLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    schoolId: 1,
                    userId: 101,
                    entity: 'SchoolSettings',
                    action: 'UPDATE',
                    ipAddress: '1.2.3.4',
                }),
            );
        });

        it('should throw error if db fails', async () => {
            const dto: UpdateSchoolSettingsDto = { motto: 'Fail' };
            (prisma.schoolSettings.upsert as jest.Mock).mockRejectedValue(new Error('DB Error'));

            await expect(service.updateSettings(1, 101, dto, '1.2.3.4')).rejects.toThrow('DB Error');
        });
    });
});

describe('UpdateSchoolSettingsDto Transform', () => {
    it('should transform empty strings to null', () => {
        const plain = { motto: '', city: '' };
        const dto = plainToInstance(UpdateSchoolSettingsDto, plain);
        expect(dto.motto).toBeNull();
        expect(dto.city).toBeNull();
    });

    it('should keep non-empty strings', () => {
        const plain = { motto: 'Valid' };
        const dto = plainToInstance(UpdateSchoolSettingsDto, plain);
        expect(dto.motto).toBe('Valid');
    });
});
