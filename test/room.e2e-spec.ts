import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { RoomController } from '../src/principal/room/room.controller';
import { RoomService } from '../src/principal/room/room.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrincipalAuthGuard } from '../src/common/guards/principal.guard';
import { ModuleGuard } from '../src/common/guards/module.guard';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';

describe('Room Management (Isolated E2E)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let schoolId: number;

    async function cleanup(sid: number) {
        if (!sid) return;
        try {
            await prisma.roomAssignment.deleteMany({ where: { schoolId: sid } });
            await prisma.room.deleteMany({ where: { schoolId: sid } });
            await prisma.section.deleteMany({ where: { schoolId: sid } });
            await prisma.class.deleteMany({ where: { schoolId: sid } });
            await prisma.academicYear.deleteMany({ where: { schoolId: sid } });
            await prisma.school.delete({ where: { id: sid } });
        } catch (e) {
            // Ignore errors if already deleted
        }
    }

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            controllers: [RoomController],
            providers: [
                RoomService,
                PrismaService,
                ConfigService,
                { provide: EventEmitter2, useValue: { emit: jest.fn() } },
            ],
        })
        .overrideGuard(PrincipalAuthGuard)
        .useValue({
            canActivate: (context) => {
                const req = context.switchToHttp().getRequest();
                req.user = { id: 1, schoolId, role: 'PRINCIPAL', modules: ['ROOMS'] };
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
        const oldSchool = await prisma.school.findUnique({ where: { subdomain: 'room-e2e' } });
        if (oldSchool) {
            await cleanup(oldSchool.id);
        }

        const school = await prisma.school.create({
            data: { name: 'Room E2E School', code: `RM-E2E-${Date.now()}`, subdomain: 'room-e2e' }
        });
        schoolId = school.id;
    });

    afterAll(async () => {
        await cleanup(schoolId);
        if (app) await app.close();
    });

    it('/api/principal/rooms (POST) - Create a room', async () => {
        const res = await (request as any)(app.getHttpServer())
            .post('/principal/rooms')
            .send({ name: 'Physics Lab', code: 'P-LAB', roomType: 'LAB' })
            .expect(201);

        expect(res.body.name).toBe('Physics Lab');
    });

    it('/api/principal/rooms (GET) - List rooms with pagination', async () => {
        const res = await (request as any)(app.getHttpServer())
            .get('/principal/rooms')
            .expect(200);

        expect(res.body.rooms).toBeDefined();
        expect(res.body.pagination).toBeDefined();
    });

    it('/api/principal/rooms/:id (DELETE) - Unassigned room deletion', async () => {
        const room = await prisma.room.create({
            data: { name: 'Temp Room', schoolId, roomType: 'CLASSROOM' }
        });

        await (request as any)(app.getHttpServer())
            .delete(`/principal/rooms/${room.id}`)
            .expect(200);
    });

    it('/api/principal/rooms/:id (DELETE) - Prevent deletion of assigned rooms', async () => {
        const room = await prisma.room.create({
            data: { 
                name: 'Main Classroom', 
                schoolId, 
                roomType: 'CLASSROOM',
            }
        });

        const year = await prisma.academicYear.create({ data: { name: 'Y1', schoolId, startDate: new Date(), endDate: new Date(), status: 'ACTIVE' } });
        const cls = await prisma.class.create({ data: { name: 'C1', schoolId, stage: 'PRIMARY' } });
        const sec = await prisma.section.create({ data: { name: 'S1', schoolId, classId: cls.id } });

        await prisma.roomAssignment.create({
            data: { schoolId, roomId: room.id, sectionId: sec.id, academicYearId: year.id, isActive: true }
        });

        await (request as any)(app.getHttpServer())
            .delete(`/principal/rooms/${room.id}`)
            .expect(400); 
    });
});
