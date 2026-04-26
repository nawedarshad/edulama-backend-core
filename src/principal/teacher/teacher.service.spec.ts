import { Test, TestingModule } from '@nestjs/testing';
import { TeacherService } from './teacher.service';
import { PrismaService } from '../../prisma/prisma.service';
import * as argon2 from 'argon2';

const mockPrisma = {
    $transaction: jest.fn((callback) => callback(mockPrisma)),
    user: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
    },
    authIdentity: {
        create: jest.fn(),
        findFirst: jest.fn(),
    },
    teacherProfile: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
    },
    teacherPersonalInfo: {
        create: jest.fn(),
        update: jest.fn(),
    },
    teacherQualification: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
    },
    teacherPreferredSubject: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
    },
    teacherSkill: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
    },
    teacherCertification: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
    },
    teacherTraining: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
    },
    teacherResponsibility: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
    },
    teacherAppraisal: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
    },
    userSchool: {
        create: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
        findFirst: jest.fn(),
    },
    userSchoolRole: {
        create: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
    },
    role: {
        findFirst: jest.fn(),
        create: jest.fn(),
    },
};

describe('TeacherService Logic Verification', () => {
    let service: TeacherService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TeacherService,
                { provide: PrismaService, useValue: mockPrisma },
            ],
        }).compile();

        service = module.get<TeacherService>(TeacherService);
    });

    describe('create', () => {
        it('should create a teacher with all enhanced fields', async () => {
            const dto = {
                name: 'John Doe',
                email: 'john@example.com',
                phone: '1234567890',
                qualifications: [],
                preferredSubjectIds: [1, 2],
                skills: ['Coding', 'Music'],
                certifications: [{ name: 'Cert A', issuer: 'Issuer A', year: 2023 }],
                additionalRoles: [{ roleName: 'House Master' }]
            };

            mockPrisma.role.findFirst.mockResolvedValue({ id: 3, name: 'TEACHER' });
            mockPrisma.user.create.mockResolvedValue({ id: 99, name: 'John Doe' });
            mockPrisma.userSchool.upsert.mockResolvedValue({ id: 10 });
            mockPrisma.teacherProfile.create.mockResolvedValue({ id: 100, userId: 99 });
            mockPrisma.teacherPersonalInfo.create.mockResolvedValue({ id: 1 });
            mockPrisma.authIdentity.findFirst.mockResolvedValue(null);

            await service.create(1, dto as any);

            expect(mockPrisma.teacherPreferredSubject.createMany).toHaveBeenCalled();
            expect(mockPrisma.teacherSkill.createMany).toHaveBeenCalled();
            expect(mockPrisma.teacherResponsibility.createMany).toHaveBeenCalled();
        });

        it('should throw BadRequestException if teacher already exists in school', async () => {
            const email = 'dup@test.com';
            mockPrisma.authIdentity.findFirst.mockResolvedValue({ 
                userId: 99, 
                user: { 
                    userSchools: [{ schoolId: 1, roles: [{ role: { name: 'TEACHER' } }] }] 
                } 
            });
            await expect(service.create(1, { name: 'Dup', email } as any))
                .rejects.toThrow('already a teacher in this school');
        });
    });

    describe('update', () => {
        it('should replace skills and certifications on update', async () => {
            const teacherId = 100;
            mockPrisma.teacherProfile.findFirst.mockResolvedValue({ 
                id: teacherId, 
                userId: 99,
                user: { name: 'Old' },
                personalInfo: { id: 1 }
            });

            await service.update(1, teacherId, { 
                skills: ['New Skill'], 
                certifications: [{ name: 'New Cert' }] 
            } as any);

            expect(mockPrisma.teacherSkill.deleteMany).toHaveBeenCalledWith({ where: { teacherId } });
            expect(mockPrisma.teacherSkill.createMany).toHaveBeenCalledWith({
                data: [{ teacherId, name: 'New Skill' }]
            });
        });
    });
});
