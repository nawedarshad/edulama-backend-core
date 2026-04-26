import { Test, TestingModule } from '@nestjs/testing';
import { TeacherService } from './teacher.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { EventEmitterModule } from '@nestjs/event-emitter';

describe('Teacher Module (Integration)', () => {
    let service: TeacherService;
    let prisma: PrismaService;
    let testSchoolId: number;

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true }),
                PrismaModule,
                EventEmitterModule.forRoot(),
            ],
            providers: [TeacherService],
        }).compile();

        service = module.get<TeacherService>(TeacherService);
        prisma = module.get<PrismaService>(PrismaService);

        // Setup test school
        const suffix = Math.floor(Math.random() * 10000);
        const school = await prisma.school.create({ 
            data: { 
                name: 'Teacher Integration School', 
                code: `T-INT-${suffix}`, 
                subdomain: `t-int-${suffix}` 
            } 
        });
        testSchoolId = school.id;
    });

    afterAll(async () => {
        if (prisma && testSchoolId) {
            await prisma.teacherProfile.deleteMany({ where: { schoolId: testSchoolId } });
            await prisma.userSchool.deleteMany({ where: { schoolId: testSchoolId } });
            await prisma.authIdentity.deleteMany({ where: { schoolId: testSchoolId } });
            await prisma.user.deleteMany({ where: { schoolId: testSchoolId } });
            await prisma.school.delete({ where: { id: testSchoolId } });
            await prisma.$disconnect();
        }
    });

    it('should create a teacher with all architectural links in one transaction', async () => {
        const dto = {
            name: 'Integration Teacher',
            email: `teacher.${Date.now()}@example.com`,
            username: `teacher.${Date.now()}`,
            phone: '1234567890',
            gender: 'MALE',
            dateOfBirth: new Date('1990-01-01'),
            addressLine1: 'Test St',
            city: 'Test City',
            state: 'Test State',
            country: 'Test Country',
            postalCode: '123456',
            emergencyContactName: 'Emergency',
            emergencyContactPhone: '9876543210'
        };

        const result = await service.create(testSchoolId, dto as any);

        expect(result).toBeDefined();
        expect(result.id).toBeDefined();

        // Verify User existence
        const user = await prisma.user.findFirst({ where: { name: dto.name, schoolId: testSchoolId } });
        expect(user).toBeDefined();

        // Verify AuthIdentity
        const identity = await prisma.authIdentity.findFirst({ where: { userId: user?.id, value: dto.username } });
        expect(identity).toBeDefined();

        // Verify UserSchool
        const membership = await prisma.userSchool.findFirst({ where: { userId: user?.id, schoolId: testSchoolId } });
        expect(membership).toBeDefined();

        // Verify PersonalInfo
        const personalInfo = await prisma.teacherPersonalInfo.findFirst({ where: { staffId: result.id } });
        expect(personalInfo).toBeDefined();
        expect(personalInfo?.email).toBe(dto.email);
    });
});
