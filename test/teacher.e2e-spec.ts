import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrincipalAuthGuard } from '../src/common/guards/principal.guard';
import { ModuleGuard } from '../src/common/guards/module.guard';
import { TeacherController } from '../src/principal/teacher/teacher.controller';
import { TeacherService } from '../src/principal/teacher/teacher.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';

describe('TeacherModule (Isolated E2E)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let testSchoolId: number;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            controllers: [TeacherController],
            providers: [
                TeacherService,
                PrismaService,
                ConfigService,
                { provide: EventEmitter2, useValue: { emit: jest.fn() } },
            ],
        })
        .overrideGuard(PrincipalAuthGuard)
        .useValue({
            canActivate: (context) => {
                const req = context.switchToHttp().getRequest();
                req.user = { id: 1, schoolId: testSchoolId, role: 'PRINCIPAL', modules: ['TEACHERS'] };
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

        // Setup Test School
        const suffix = Math.floor(Math.random() * 10000);
        const school = await prisma.school.create({
            data: { name: 'Teacher E2E School', code: `T-E2E-${suffix}`, subdomain: `t-e2e-${suffix}` }
        });
        testSchoolId = school.id;
    });

    afterAll(async () => {
        if (prisma && testSchoolId) {
            await prisma.teacherProfile.deleteMany({ where: { schoolId: testSchoolId } });
            await prisma.userSchool.deleteMany({ where: { schoolId: testSchoolId } });
            await prisma.user.deleteMany({ where: { schoolId: testSchoolId } });
            await prisma.school.delete({ where: { id: testSchoolId } });
        }
        if (app) await app.close();
    });

    describe('GET /principal/teachers', () => {
        it('should return list of teachers', async () => {
            const response = await (request as any)(app.getHttpServer())
                .get('/principal/teachers')
                .expect(200);

            expect(response.body).toHaveProperty('data');
            expect(Array.isArray(response.body.data)).toBe(true);
        });
    });

    describe('POST /principal/teachers', () => {
        it('should create a new teacher profile', async () => {
            const payload = {
                name: 'E2E Teacher',
                email: `e2e.${Date.now()}@test.com`,
                username: `e2e_user_${Date.now()}`,
                phone: '1234567890',
                gender: 'FEMALE',
                dateOfBirth: '1995-05-15',
                addressLine1: 'E2E St',
                alternatePhone: '0000000000',
                city: 'E2E City',
                state: 'E2E State',
                country: 'E2E Country',
                postalCode: '123456',
                emergencyContactName: 'E2E Emergency',
                emergencyContactPhone: '9988776655',
                employmentType: 'FULL_TIME',
                empCode: `E2E-${Date.now()}`
            };

            const response = await (request as any)(app.getHttpServer())
                .post('/principal/teachers')
                .send(payload)
                .expect(201);

            expect(response.body.id).toBeDefined();
        });
    });
});
