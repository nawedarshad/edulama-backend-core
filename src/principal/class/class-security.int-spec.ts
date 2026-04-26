import { Test, TestingModule } from '@nestjs/testing';
import { ClassService } from './class.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';

describe('Class Module (Tenant Isolation & Security)', () => {
    let service: ClassService;
    let prisma: PrismaService;
    let schoolAId: number;
    let schoolBId: number;
    let classBId: number;

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true }),
                PrismaModule,
                EventEmitterModule.forRoot(),
            ],
            providers: [ClassService],
        }).compile();

        service = module.get<ClassService>(ClassService);
        prisma = module.get<PrismaService>(PrismaService);

        // Create two isolated schools
        const schoolA = await prisma.school.create({ data: { name: 'School A', code: 'ISO-A', subdomain: 'isoa' } });
        const schoolB = await prisma.school.create({ data: { name: 'School B', code: 'ISO-B', subdomain: 'isob' } });
        
        schoolAId = schoolA.id;
        schoolBId = schoolB.id;

        // Create a class in School B
        const classB = await prisma.class.create({
            data: { name: 'Secret B Class', schoolId: schoolBId, stage: 'PRIMARY' }
        });
        classBId = classB.id;
    });

    afterAll(async () => {
        await prisma.class.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
        await prisma.school.deleteMany({ where: { id: { in: [schoolAId, schoolBId] } } });
        await prisma.$disconnect();
    });

    it('SHOULD NOT allow School A to find a class belonging to School B', async () => {
        await expect(service.findOne(schoolAId, classBId))
            .rejects.toThrow(NotFoundException);
    });

    it('SHOULD NOT allow School A to delete a class belonging to School B', async () => {
        await expect(service.remove(schoolAId, classBId, 1))
            .rejects.toThrow(NotFoundException);
    });

    it('SHOULD return empty list for School A even though School B has classes', async () => {
        const result = await service.findAll(schoolAId);
        expect(result.data.length).toBe(0);
        expect(result.meta.total).toBe(0);
    });
});
