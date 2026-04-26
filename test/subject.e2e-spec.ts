import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

import { PrincipalAuthGuard } from '../src/common/guards/principal.guard';
import { ModuleGuard } from '../src/common/guards/module.guard';

import { SubjectController } from '../src/principal/subject/subject.controller';
import { SubjectService } from '../src/principal/subject/subject.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';

describe('SubjectModule (Isolated E2E)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let authToken = 'test-token';

    let testSchoolId: number;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            controllers: [SubjectController],
            providers: [
                SubjectService,
                PrismaService,
                ConfigService,
                { provide: EventEmitter2, useValue: { emit: jest.fn() } },
            ],
        })
        .overrideGuard(PrincipalAuthGuard)
        .useValue({
            canActivate: (context) => {
                const req = context.switchToHttp().getRequest();
                req.user = { id: 1, schoolId: testSchoolId, role: 'PRINCIPAL', modules: ['SUBJECTS'] };
                return true;
            }
        })
        .overrideGuard(ModuleGuard)
        .useValue({ canActivate: () => true })
        .compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
        await app.init();

        prisma = app.get<PrismaService>(PrismaService);

        // 🛡️ Setup Clean Test State
        const suffix = Math.floor(Math.random() * 10000);
        const school = await prisma.school.create({
            data: { name: 'E2E School', code: `E2E-${suffix}`, subdomain: `e2e-${suffix}` }
        });
        testSchoolId = school.id;

        await prisma.academicYear.create({
            data: { name: '2026', startDate: new Date(), endDate: new Date(), status: 'ACTIVE', schoolId: testSchoolId }
        });
    });

    afterAll(async () => {
        if (prisma && testSchoolId) {
            await prisma.subjectAssignment.deleteMany({ where: { schoolId: testSchoolId } });
            await prisma.classSubject.deleteMany({ where: { schoolId: testSchoolId } });
            await prisma.academicYear.deleteMany({ where: { schoolId: testSchoolId } });
            await prisma.school.delete({ where: { id: testSchoolId } });
        }
        if (app) await app.close();
    });

    describe('GET /principal/subject/health', () => {
        it('should return 200 health status', () => {
            return (request as any)(app.getHttpServer())
                .get('/principal/subject/health')
                .expect(200)
                .expect(res => {
                    expect(res.body.status).toBe('ok');
                    expect(res.body.module).toBe('SUBJECTS');
                });
        });
    });

    describe('GET /principal/subject', () => {
        it('should return list of subjects', async () => {
            const response = await (request as any)(app.getHttpServer())
                .get('/principal/subject')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.data).toBeInstanceOf(Array);
        });
    });

    describe('GET /principal/subject/faculty/overview', () => {
        it('should return faculty overview for the school', async () => {
            const response = await (request as any)(app.getHttpServer())
                .get('/principal/subject/faculty/overview')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body).toBeInstanceOf(Array);
            if (response.body.length > 0) {
                expect(response.body[0]).toHaveProperty('name');
                expect(response.body[0]).toHaveProperty('subjects');
            }
        });
    });

    describe('POST /principal/subject/class-assignment', () => {
        it('should fail with 400 if credits are negative', async () => {
            const subject = await prisma.subject.create({
                data: { name: 'E2E Subject', code: 'E2E-SUB', schoolId: testSchoolId }
            });

            return (request as any)(app.getHttpServer())
                .post('/principal/subject/class-assignment')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    classId: 1,
                    subjectId: subject.id,
                    credits: -5
                })
                .expect(400);
        });
    });
});
