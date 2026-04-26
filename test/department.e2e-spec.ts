import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { HttpService, HttpModule } from '@nestjs/axios';
import { of } from 'rxjs';
import { cleanDatabase } from './integration-utils';
import { PrismaService } from '../src/prisma/prisma.service';
import * as dotenv from 'dotenv';
import { DepartmentModule } from '../src/principal/department/department.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';

dotenv.config(); // Load environment variables from .env

describe('DepartmentController (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    const mockPrincipalUser = {
        id: 100,
        name: 'Principal User',
        role: 'PRINCIPAL',
        schoolId: 1,
        modules: ['DEPARTMENTS'],
    };

    const mockTeacherUser = {
        id: 200,
        name: 'Teacher User',
        role: 'TEACHER',
        schoolId: 1,
        modules: ['DEPARTMENTS'],
    };

    const httpServiceMock = {
        get: jest.fn(),
    };

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true }),
                HttpModule,
                PrismaModule,
                DepartmentModule,
            ],
        })
            .overrideProvider(HttpService)
            .useValue(httpServiceMock)
            .compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
        app.setGlobalPrefix('core');
        await app.init();

        prisma = app.get<PrismaService>(PrismaService);
    });

    beforeEach(async () => {
        await cleanDatabase();
        // Setup fixtures
        await prisma.school.create({ 
            data: { id: 1, name: 'E2E School', code: 'E2E01', subdomain: 'e2e' } 
        });
        await prisma.user.create({ 
            data: { id: 100, name: 'Principal', schoolId: 1 } 
        });
        await prisma.user.create({ 
            data: { id: 200, name: 'Teacher', schoolId: 1 } 
        });
    });

    afterAll(async () => {
        if (app) {
            await app.close();
        }
    });

    describe('POST /principal/departments', () => {
        it('should create a department when authorized as Principal', () => {
            httpServiceMock.get.mockReturnValue(of({ data: { user: mockPrincipalUser } }));

            return request(app.getHttpServer())
                .post('/core/principal/departments')
                .set('Authorization', 'Bearer valid-token')
                .set('x-school-id', '1')
                .send({
                    code: 'MATH',
                    name: 'Mathematics',
                    description: 'E2E Test Dept'
                })
                .expect(201)
                .expect((res) => {
                    expect(res.body.code).toBe('MATH');
                    expect(res.body.id).toBeDefined();
                });
        });

        it('should reject creation when user is not a Principal', () => {
            httpServiceMock.get.mockReturnValue(of({ data: { user: mockTeacherUser } }));

            return request(app.getHttpServer())
                .post('/core/principal/departments')
                .set('Authorization', 'Bearer teacher-token')
                .set('x-school-id', '1')
                .send({ code: 'FAIL', name: 'Failure' })
                .expect(401); // PrincipalAuthGuard throws UnauthorizedException for wrong role
        });

        it('should return 400 when required fields are missing (Validation Pipe)', () => {
            httpServiceMock.get.mockReturnValue(of({ data: { user: mockPrincipalUser } }));

            return request(app.getHttpServer())
                .post('/core/principal/departments')
                .set('Authorization', 'Bearer valid-token')
                .set('x-school-id', '1')
                .send({ code: 'MISSING_NAME' })
                .expect(400)
                .expect((res) => {
                    expect(res.body.message).toContain('name should not be empty');
                });
        });
    });

    describe('GET /principal/departments', () => {
        it('should retrieve list of departments', async () => {
            httpServiceMock.get.mockReturnValue(of({ data: { user: mockPrincipalUser } }));

            // Insert one dept manually
            await prisma.department.create({
                data: { id: 1, code: 'EXIST', name: 'Existing', schoolId: 1 }
            });

            return request(app.getHttpServer())
                .get('/core/principal/departments')
                .set('Authorization', 'Bearer valid-token')
                .set('x-school-id', '1')
                .expect(200)
                .expect((res) => {
                    expect(res.body.data).toHaveLength(1);
                    expect(res.body.data[0].code).toBe('EXIST');
                });
        });

        it('should block access without Authorization header', () => {
            return request(app.getHttpServer())
                .get('/core/principal/departments')
                .expect(401);
        });
    });

    describe('Member Management E2E', () => {
        it('should add a member via HTTP POST', async () => {
            httpServiceMock.get.mockReturnValue(of({ data: { user: mockPrincipalUser } }));

            const dept = await prisma.department.create({
                data: { code: 'MEM', name: 'Membership', schoolId: 1 }
            });

            return request(app.getHttpServer())
                .post(`/core/principal/departments/${dept.id}/members`)
                .set('Authorization', 'Bearer valid-token')
                .set('x-school-id', '1')
                .send({ userId: 200, role: 'TEACHER' })
                .expect(201);
        });

        it('should retrieve paginated members via HTTP GET', async () => {
            httpServiceMock.get.mockReturnValue(of({ data: { user: mockPrincipalUser } }));

            const dept = await prisma.department.create({
                data: { code: 'LIST', name: 'List', schoolId: 1 }
            });

            await prisma.departmentMember.create({
                data: { departmentId: dept.id, userId: 200, role: 'TEACHER' }
            });

            return request(app.getHttpServer())
                .get(`/core/principal/departments/${dept.id}/members`)
                .set('Authorization', 'Bearer valid-token')
                .set('x-school-id', '1')
                .expect(200)
                .expect((res) => {
                    expect(res.body.data).toHaveLength(1);
                    expect(res.body.meta.total).toBe(1);
                });
        });
    });
});
