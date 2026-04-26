import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { HouseController } from '../src/principal/house/house.controller';
import { HouseService } from '../src/principal/house/house.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrincipalAuthGuard } from '../src/common/guards/principal.guard';
import { ModuleGuard } from '../src/common/guards/module.guard';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';

describe('House Management (Isolated E2E)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let schoolId: number;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            controllers: [HouseController],
            providers: [
                HouseService,
                PrismaService,
                ConfigService,
                { provide: EventEmitter2, useValue: { emit: jest.fn() } },
            ],
        })
        .overrideGuard(PrincipalAuthGuard)
        .useValue({
            canActivate: (context) => {
                const req = context.switchToHttp().getRequest();
                req.user = { id: 1, schoolId, role: 'PRINCIPAL', modules: ['HOUSES'] };
                return true;
            }
        })
        .overrideGuard(ModuleGuard)
        .useValue({ canActivate: () => true })
        .compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe());
        await app.init();

        prisma = app.get<PrismaService>(PrismaService);

        // Setup test school
        const school = await prisma.school.create({
            data: { name: 'House E2E School', code: `H-E2E-${Date.now()}`, subdomain: 'house-e2e' }
        });
        schoolId = school.id;
    });

    afterAll(async () => {
        if (prisma && schoolId) {
            await prisma.house.deleteMany({ where: { schoolId } });
            await prisma.school.delete({ where: { id: schoolId } });
        }
        if (app) await app.close();
    });

    it('/api/principal/houses (POST) - Create house', async () => {
        const res = await (request as any)(app.getHttpServer())
            .post('/principal/houses')
            .send({ name: 'Green House', color: '#00FF00' })
            .expect(201);

        expect(res.body.name).toBe('Green House');
    });

    it('/api/principal/houses (GET) - List houses', async () => {
        const res = await (request as any)(app.getHttpServer())
            .get('/principal/houses')
            .expect(200);

        expect(Array.isArray(res.body)).toBe(true);
    });

    it('/api/principal/houses/:id (DELETE) - Unassigned house deletion', async () => {
        const house = await prisma.house.create({
            data: { name: 'Temp House', schoolId }
        });

        await (request as any)(app.getHttpServer())
            .delete(`/principal/houses/${house.id}`)
            .expect(200);
    });
});
