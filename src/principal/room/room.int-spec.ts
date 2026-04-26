import { Test, TestingModule } from '@nestjs/testing';
import { RoomService } from './room.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { RoomType } from '@prisma/client';

describe('Room Module (Integration)', () => {
    let service: RoomService;
    let prisma: PrismaService;
    let schoolId: number;

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true }),
                PrismaModule,
                EventEmitterModule.forRoot(),
            ],
            providers: [RoomService],
        }).compile();

        service = module.get<RoomService>(RoomService);
        prisma = module.get<PrismaService>(PrismaService);

        // Setup test school
        const school = await prisma.school.create({
            data: { name: 'Integration Room School', code: 'INT-ROOM', subdomain: 'introom' }
        });
        schoolId = school.id;
    });

    afterAll(async () => {
        if (prisma && schoolId) {
            await prisma.roomAssignment.deleteMany({ where: { schoolId } });
            await prisma.room.deleteMany({ where: { schoolId } });
            await prisma.school.delete({ where: { id: schoolId } });
        }
        await prisma.$disconnect();
    });

    it('should enforce unique room codes within the same school', async () => {
        const dto = { name: 'Room 101', code: 'R101', roomType: RoomType.CLASSROOM };
        await service.create(schoolId, dto as any, 1);

        // Attempting to create another room with the same code in the same school should fail
        await expect(service.create(schoolId, { ...dto, name: 'Room 101-B' } as any, 1))
            .rejects.toThrow();
    });

    it('should correctly handle multi-tenant isolation (Different schools can have same room code)', async () => {
        const schoolB = await prisma.school.create({
            data: { name: 'School B', code: 'ROOM-B', subdomain: 'room-b' }
        });

        const dto = { name: 'Shared Code Room', code: 'SHARED-1', roomType: RoomType.CLASSROOM };
        
        // Create in School A
        await service.create(schoolId, dto as any, 1);
        
        // Should be allowed in School B
        const roomB = await service.create(schoolB.id, dto as any, 1);
        expect(roomB).toBeDefined();
        expect(roomB.schoolId).toBe(schoolB.id);

        // Cleanup School B
        await prisma.room.deleteMany({ where: { schoolId: schoolB.id } });
        await prisma.school.delete({ where: { id: schoolB.id } });
    });
});
