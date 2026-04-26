import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrincipalAuthGuard } from '../src/common/guards/principal.guard';

describe('SchoolSettings (E2E)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let token: string;
    let schoolId: number;

    beforeAll(async () => {
        try {
            const moduleFixture: TestingModule = await Test.createTestingModule({
                imports: [AppModule],
            })
            .overrideGuard(PrincipalAuthGuard)
            .useValue({
                canActivate: (context) => {
                    const req = context.switchToHttp().getRequest();
                    req.user = { id: 1, schoolId, role: 'PRINCIPAL' };
                    return true;
                }
            })
            .compile();

            app = moduleFixture.createNestApplication();
            app.useGlobalPipes(new ValidationPipe());
            await app.init();

            prisma = app.get<PrismaService>(PrismaService);

            // Setup test data
            const school = await prisma.school.create({
                data: { name: 'E2E School', code: 'E2E-SET', subdomain: 'e2eset' }
            });
            schoolId = school.id;
            token = 'mock-token';
        } catch (error) {
            console.error('Setup failed', error);
            throw error;
        }
    });

    afterAll(async () => {
        if (prisma && schoolId) {
            await prisma.school.delete({ where: { id: schoolId } }).catch(() => {});
        }
        if (app) {
            await app.close();
        }
    });

    it('/api/principal/global/settings (GET) - Retrieves settings', async () => {
        const response = await (request as any)(app.getHttpServer())
            .get('/api/principal/global/settings')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        expect(response.body).toBeDefined();
    });

    it('/api/principal/global/settings (PATCH) - Updates settings', async () => {
        await (request as any)(app.getHttpServer())
            .patch('/api/principal/global/settings')
            .set('Authorization', `Bearer ${token}`)
            .send({ motto: 'E2E Excellence' })
            .expect(200);

        const check = await (request as any)(app.getHttpServer())
            .get('/api/principal/global/settings')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        expect(check.body.motto).toBe('E2E Excellence');
    });

    it('/api/principal/global/settings (PATCH) - Validation fails on bad email', async () => {
        await (request as any)(app.getHttpServer())
            .patch('/api/principal/global/settings')
            .set('Authorization', `Bearer ${token}`)
            .send({ email: 'not-an-email' })
            .expect(400);
    });
});
