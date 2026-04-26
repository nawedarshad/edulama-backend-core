import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { ClassController } from '../src/principal/class/class.controller';
import { ClassService } from '../src/principal/class/class.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrincipalAuthGuard } from '../src/common/guards/principal.guard';
import { ModuleGuard } from '../src/common/guards/module.guard';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';

describe('Class Management (Isolated E2E)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let schoolId: number;

    beforeAll(async () => {
        try {
            const moduleFixture: TestingModule = await Test.createTestingModule({
                controllers: [ClassController],
                providers: [
                    ClassService,
                    PrismaService,
                    ConfigService,
                    { provide: EventEmitter2, useValue: { emit: jest.fn() } },
                ],
            })
            .overrideGuard(PrincipalAuthGuard)
            .useValue({
                canActivate: (context) => {
                    const req = context.switchToHttp().getRequest();
                    req.user = { id: 1, schoolId, role: 'PRINCIPAL', modules: ['CLASSES'] };
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

            // Cleanup junk
            const oldSchool = await prisma.school.findUnique({ where: { subdomain: 'e2eclass' } });
            if (oldSchool) {
                await prisma.academicGroup.deleteMany({ where: { schoolId: oldSchool.id } });
                await prisma.section.deleteMany({ where: { schoolId: oldSchool.id } });
                await prisma.class.deleteMany({ where: { schoolId: oldSchool.id } });
                await prisma.school.delete({ where: { id: oldSchool.id } });
            }

            const school = await prisma.school.create({
                data: { name: 'E2E Class School', code: `E2E-CLS-${Date.now()}`, subdomain: 'e2eclass' }
            });
            schoolId = school.id;
        } catch (e) {
            console.error('Setup failed', e);
            throw e;
        }
    });

    afterAll(async () => {
        if (prisma && schoolId) {
            await prisma.academicGroup.deleteMany({ where: { schoolId } });
            await prisma.section.deleteMany({ where: { schoolId } });
            await prisma.class.deleteMany({ where: { schoolId } });
            await prisma.school.delete({ where: { id: schoolId } });
        }
        if (app) await app.close();
    });

    it('/api/principal/classes (POST) - Create class', async () => {
        const res = await (request as any)(app.getHttpServer())
            .post('/principal/classes')
            .send({ name: 'E2E Grade 1', stage: 'PRIMARY' })
            .expect(201);

        expect(res.body.name).toBe('E2E Grade 1');
    });

    it('/api/principal/classes (GET) - List classes', async () => {
        const res = await (request as any)(app.getHttpServer())
            .get('/principal/classes')
            .expect(200);

        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.meta).toBeDefined();
    });

    it('/api/principal/classes/:id (DELETE) - Blocked if has sections', async () => {
        const cls = await prisma.class.create({
            data: { 
                name: 'Main Class', 
                schoolId, 
                stage: 'PRIMARY',
                sections: { create: { name: 'Sec 1', schoolId } }
            }
        });

        await (request as any)(app.getHttpServer())
            .delete(`/principal/classes/${cls.id}`)
            .expect(400); 
    });
});
