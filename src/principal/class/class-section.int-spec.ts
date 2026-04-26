import { Test, TestingModule } from '@nestjs/testing';
import { ClassService } from './class.service';
import { SectionService } from '../section/section.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { EventEmitterModule } from '@nestjs/event-emitter';

describe('Class & Section (Integration)', () => {
    let classService: ClassService;
    let sectionService: SectionService;
    let prisma: PrismaService;
    let schoolId: number;

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true }),
                PrismaModule,
                EventEmitterModule.forRoot(),
            ],
            providers: [ClassService, SectionService],
        }).compile();

        classService = module.get<ClassService>(ClassService);
        sectionService = module.get<SectionService>(SectionService);
        prisma = module.get<PrismaService>(PrismaService);

        // Cleanup any potential junk from previous failed runs
        const oldSchool = await prisma.school.findUnique({ where: { subdomain: 'intclass' } });
        if (oldSchool) {
            await prisma.academicGroup.deleteMany({ where: { schoolId: oldSchool.id } });
            await prisma.section.deleteMany({ where: { schoolId: oldSchool.id } });
            await prisma.class.deleteMany({ where: { schoolId: oldSchool.id } });
            await prisma.school.delete({ where: { id: oldSchool.id } });
        }

        // Setup test school
        const school = await prisma.school.create({
            data: { name: 'Integration Class School', code: `INT-CLS-${Date.now()}`, subdomain: 'intclass' }
        });
        schoolId = school.id;
    });

    afterAll(async () => {
        if (prisma && schoolId) {
            // Delete in correct order to respect FK constraints
            await prisma.academicGroup.deleteMany({ where: { schoolId } });
            await prisma.section.deleteMany({ where: { schoolId } });
            await prisma.class.deleteMany({ where: { schoolId } });
            await prisma.school.delete({ where: { id: schoolId } });
        }
        await prisma.$disconnect();
    });

    it('should create a class with multiple sections in one transaction', async () => {
        const dto = {
            name: 'Integration Grade 1',
            stage: 'PRIMARY' as any,
            sections: [
                { name: 'Sec A', capacity: 30 },
                { name: 'Sec B', capacity: 30 }
            ]
        };

        const newClass = await classService.createWithSections(schoolId, dto as any, 1);
        expect(newClass).toBeDefined();

        const sections = await prisma.section.findMany({ where: { classId: newClass.id } });
        expect(sections.length).toBe(2);
        expect(sections.map(s => s.name)).toContain('Sec A');
    });

    it('should enforce class-wide capacity limits during separate section creation', async () => {
        // Create class with capacity 50
        const cls = await classService.create(schoolId, { name: 'Cap Test Class', capacity: 50 } as any, 1);
        
        // Add section of 30
        await sectionService.create(schoolId, { name: 'S1', classId: cls.id, capacity: 30 } as any, 1);
        
        // Attempt to add section of 25 (Exceeds 50)
        await expect(sectionService.create(schoolId, { name: 'S2', classId: cls.id, capacity: 25 } as any, 1))
            .rejects.toThrow();
    });
});
