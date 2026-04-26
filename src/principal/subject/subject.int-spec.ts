import { Test, TestingModule } from '@nestjs/testing';
import { SubjectService } from './subject.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { EventEmitterModule } from '@nestjs/event-emitter';

describe('Subject Module (Integration)', () => {
    let service: SubjectService;
    let prisma: PrismaService;
    let testSchoolId: number;

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true }),
                PrismaModule,
                EventEmitterModule.forRoot(),
            ],
            providers: [SubjectService],
        }).compile();

        service = module.get<SubjectService>(SubjectService);
        prisma = module.get<PrismaService>(PrismaService);

        // Setup test school
        const suffix = Math.floor(Math.random() * 10000);
        const school = await prisma.school.create({ 
            data: { 
                name: 'Test School Subjects', 
                code: `TSS-${suffix}`, 
                subdomain: `tss-${suffix}` 
            } 
        });
        testSchoolId = school.id;
    });

    afterAll(async () => {
        if (prisma) {
            await prisma.subjectAssignment.deleteMany({ where: { schoolId: testSchoolId } });
            await prisma.classSubject.deleteMany({ where: { schoolId: testSchoolId } });
            await prisma.section.deleteMany({ where: { schoolId: testSchoolId } });
            await prisma.class.deleteMany({ where: { schoolId: testSchoolId } });
            await prisma.academicYear.deleteMany({ where: { schoolId: testSchoolId } });
            await prisma.subject.deleteMany({ where: { schoolId: testSchoolId } });
            try {
                await prisma.school.delete({ where: { id: testSchoolId } });
            } catch (e) {
                console.warn('Cleanup warning: Could not delete school', e.message);
            }
            await prisma.$disconnect();
        }
    });

    it('should maintain atomic transaction integrity for class assignments', async () => {
        // 1. Create a global subject
        const subject = await service.create(testSchoolId, { name: 'Integration Math', code: 'IMATH' }, 1);

        // 2. Create a class and section
        const academicYear = await prisma.academicYear.create({
            data: { name: '2026', startDate: new Date(), endDate: new Date(), status: 'ACTIVE', schoolId: testSchoolId }
        });
        const cls = await prisma.class.create({ data: { name: 'Class 1', schoolId: testSchoolId, academicYearId: academicYear.id } });
        const section = await prisma.section.create({ data: { name: 'Sec A', classId: cls.id, schoolId: testSchoolId, academicYearId: academicYear.id } });

        // 3. Create a teacher
        const user = await prisma.user.create({ data: { name: 'Test Teacher', schoolId: testSchoolId } });
        const teacher = await prisma.teacherProfile.create({ data: { schoolId: testSchoolId, userId: user.id } });

        // 4. Perform assignment with Teacher (triggers Phase 2 sync)
        await service.assignToClass(testSchoolId, {
            classId: cls.id,
            sectionId: section.id,
            subjectId: subject.id,
            credits: 4,
            teacherId: teacher.id
        }, 1);

        // 5. Verify Phase 1 (Config) and Phase 2 (Allocation) sync
        const config = await prisma.classSubject.findFirst({
            where: { schoolId: testSchoolId, sectionId: section.id, subjectId: subject.id }
        });
        expect(config).toBeDefined();
        expect(config?.credits).toBe(4);
        expect(config?.teacherProfileId).toBe(teacher.id);

        const assignment = await prisma.subjectAssignment.findFirst({
            where: { schoolId: testSchoolId, sectionId: section.id, subjectId: subject.id }
        });
        expect(assignment).toBeDefined();
        expect(assignment?.teacherId).toBe(teacher.id);
        expect(assignment?.isActive).toBe(true);
    });
});
