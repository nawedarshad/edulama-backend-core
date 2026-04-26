import { Test, TestingModule } from '@nestjs/testing';
import { RoomService } from './room.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { RoomType } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';

describe('Room Module (Security & Isolation)', () => {
    let service: RoomService;
    let prisma: PrismaService;
    let schoolAId: number;
    let schoolBId: number;
    let roomBId: number;

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

        // Create two isolated schools
        const schoolA = await prisma.school.create({ data: { name: 'School A', code: 'ISO-RA', subdomain: 'isora' } });
        const schoolB = await prisma.school.create({ data: { name: 'School B', code: 'ISO-RB', subdomain: 'isorb' } });
        
        schoolAId = schoolA.id;
        schoolBId = schoolB.id;

        // Create a room in School B
        const roomB = await prisma.room.create({
            data: { name: 'Secret Lab B', schoolId: schoolBId, roomType: RoomType.LAB, code: 'SECRET-B' }
        });
        roomBId = roomB.id;
    });

    afterAll(async () => {
        await prisma.roomAssignment.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
        await prisma.room.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
        await prisma.school.deleteMany({ where: { id: { in: [schoolAId, schoolBId] } } });
        await prisma.$disconnect();
    });

    it('SHOULD NOT allow School A to find a room belonging to School B', async () => {
        await expect(service.findOne(schoolAId, roomBId))
            .rejects.toThrow(NotFoundException);
    });

    it('SHOULD NOT allow School A to delete a room belonging to School B', async () => {
        await expect(service.remove(schoolAId, roomBId, 1))
            .rejects.toThrow(NotFoundException);
    });

    it('SHOULD NOT return School B rooms when School A lists rooms', async () => {
        const result = await service.findAll(schoolAId, {});
        expect(result.rooms.every(r => r.id !== roomBId)).toBe(true);
    });
});
