import { Test, TestingModule } from '@nestjs/testing';
import { SchoolSettingsService } from './school-settings.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditLogService } from '../../../common/audit/audit-log.service';
import { UpdateSchoolSettingsDto } from './dto/update-school-settings.dto';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { S3StorageService } from '../../../common/file-upload/s3-storage.service';
import { plainToInstance } from 'class-transformer';

describe('SchoolSettingsService', () => {
    let service: SchoolSettingsService;
    let prisma: PrismaService;
    let cacheManager: any;

    const mockPrismaService = {
        schoolSettings: {
            findUnique: jest.fn(),
            create: jest.fn(),
            upsert: jest.fn(),
        },
        school: {
            findUnique: jest.fn(),
        }
    };

    const mockCacheManager = {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
    };

    const mockAuditLogService = { createLog: jest.fn() };
    const mockS3Storage = { extractKeyFromUrl: jest.fn(), deleteFile: jest.fn() };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SchoolSettingsService,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: CACHE_MANAGER, useValue: mockCacheManager },
                { provide: AuditLogService, useValue: mockAuditLogService },
                { provide: S3StorageService, useValue: mockS3Storage },
            ],
        }).compile();

        service = module.get<SchoolSettingsService>(SchoolSettingsService);
        prisma = module.get<PrismaService>(PrismaService);
        cacheManager = module.get(CACHE_MANAGER);
    });

    afterEach(() => { jest.clearAllMocks(); });

    describe('getSchoolInfo', () => {
        it('should return cached school info if available', async () => {
            const mockSchool = { id: 1, name: 'Test School' };
            mockCacheManager.get.mockResolvedValue(mockSchool);

            const result = await service.getSchoolInfo(1);
            expect(result).toEqual(mockSchool);
            expect(mockCacheManager.get).toHaveBeenCalledWith('SCHOOL_INFO:1');
            expect(mockPrismaService.school.findUnique).not.toHaveBeenCalled();
        });

        it('should fetch and cache school info if not in cache', async () => {
            const mockSchool = { id: 1, name: 'Test School' };
            mockCacheManager.get.mockResolvedValue(null);
            mockPrismaService.school.findUnique.mockResolvedValue(mockSchool);

            const result = await service.getSchoolInfo(1);
            expect(result).toEqual(mockSchool);
            expect(mockCacheManager.set).toHaveBeenCalledWith('SCHOOL_INFO:1', mockSchool, expect.any(Number));
        });
    });

    describe('getSettings', () => {
        it('should use versioned cache for settings', async () => {
            mockCacheManager.get.mockImplementation((key) => {
                if (key === 'SETTINGS_VER:1') return 123;
                if (key === 'SETTINGS_SINGLE:1:V123') return { id: 1, motto: 'Cached' };
                return null;
            });

            const result = await service.getSettings(1) as any;
            expect(result.motto).toBe('Cached');
            expect(mockPrismaService.schoolSettings.findUnique).not.toHaveBeenCalled();
        });

        it('should fetch from DB and cache if missiong in cache', async () => {
            mockCacheManager.get.mockResolvedValue(null);
            const mockSettings = { id: 1, schoolId: 1, motto: 'DB' };
            mockPrismaService.schoolSettings.findUnique.mockResolvedValue(mockSettings);

            const result = await service.getSettings(1) as any;
            expect(result.motto).toBe('DB');
            expect(mockCacheManager.set).toHaveBeenCalled();
        });
    });

    describe('updateSettings', () => {
        it('should invalidate cache on update', async () => {
            const dto: UpdateSchoolSettingsDto = { motto: 'Updated' };
            mockPrismaService.schoolSettings.findUnique.mockResolvedValue({});
            mockPrismaService.schoolSettings.upsert.mockResolvedValue({ id: 1 });

            await service.updateSettings(1, 101, dto, '127.0.0.1');

            expect(mockCacheManager.set).toHaveBeenCalledWith('SETTINGS_VER:1', expect.any(Number), expect.any(Number));
            expect(mockCacheManager.del).toHaveBeenCalledWith('SETTINGS_SINGLE:1');
            expect(mockCacheManager.del).toHaveBeenCalledWith('SCHOOL_INFO:1');
        });
    });
});
