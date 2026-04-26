import { Test, TestingModule } from '@nestjs/testing';
import { SchoolSettingsService } from './school-settings.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CacheModule } from '@nestjs/cache-manager';
import { AuditLogModule } from '../../../common/audit/audit-log.module';
import { FileUploadModule } from '../../../common/file-upload/file-upload.module';
import { PrismaModule } from '../../../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';

describe('SchoolSettingsService (Integration)', () => {
    let service: SchoolSettingsService;
    let prisma: PrismaService;
    let schoolId: number;

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true }),
                PrismaModule,
                CacheModule.register({ isGlobal: true }),
                AuditLogModule,
                FileUploadModule,
            ],
            providers: [SchoolSettingsService],
        }).compile();

        service = module.get<SchoolSettingsService>(SchoolSettingsService);
        prisma = module.get<PrismaService>(PrismaService);

        // Setup a test school
        const school = await prisma.school.create({
            data: {
                name: 'Int Test School',
                code: 'INT-TEST',
                subdomain: 'inttest',
            }
        });
        schoolId = school.id;
    });

    afterAll(async () => {
        await prisma.school.delete({ where: { id: schoolId } });
        await prisma.$disconnect();
    });

    it('should create default settings on first access', async () => {
        const settings = await service.getSettings(schoolId) as any;
        expect(settings).toBeDefined();
        expect(settings.schoolId).toBe(schoolId);
        expect(settings.attendanceMode).toBe('DAILY');
    });

    it('should update and then retrieve settings (DB + Cache integrity)', async () => {
        await service.updateSettings(schoolId, 1, { motto: 'Integrity First' } as any, '127.0.0.1');
        
        // Retrieve - should be from cache now
        const settings = await service.getSettings(schoolId) as any;
        expect(settings.motto).toBe('Integrity First');
        
        // Verify in DB directly
        const dbSettings = await prisma.schoolSettings.findUnique({ where: { schoolId } });
        expect(dbSettings?.motto).toBe('Integrity First');
    });
});
