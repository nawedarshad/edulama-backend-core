import { Test, TestingModule } from '@nestjs/testing';
import { HouseService } from './house.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { EventEmitterModule } from '@nestjs/event-emitter';

describe('House Module (Integration)', () => {
    let service: HouseService;
    let prisma: PrismaService;
    let schoolAId: number;
    let schoolBId: number;

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true }),
                PrismaModule,
                EventEmitterModule.forRoot(),
            ],
            providers: [HouseService],
        }).compile();

        service = module.get<HouseService>(HouseService);
        prisma = module.get<PrismaService>(PrismaService);

        // Setup two schools
        const schoolA = await prisma.school.create({ data: { name: 'School A', code: 'H-A', subdomain: 'ha' } });
        const schoolB = await prisma.school.create({ data: { name: 'School B', code: 'H-B', subdomain: 'hb' } });
        schoolAId = schoolA.id;
        schoolBId = schoolB.id;
    });

    afterAll(async () => {
        if (prisma) {
            await prisma.house.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
            await prisma.school.deleteMany({ where: { id: { in: [schoolAId, schoolBId] } } });
            await prisma.$disconnect();
        }
    });

    it('should allow same house name in different schools but not same school', async () => {
        // Create Blue House in School A
        await service.create(schoolAId, { name: 'Blue House' }, 1);

        // Should allow Blue House in School B
        const houseB = await service.create(schoolBId, { name: 'Blue House' }, 1);
        expect(houseB).toBeDefined();

        // Should FAIL to create another Blue House in School A
        await expect(service.create(schoolAId, { name: 'Blue House' }, 1))
            .rejects.toThrow();
    });

    it('should filter results by schoolId', async () => {
        const schoolAhouses = await service.findAll(schoolAId);
        expect(schoolAhouses.every(h => h.schoolId === schoolAId)).toBe(true);
    });
});
