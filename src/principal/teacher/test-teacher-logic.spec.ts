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

        // Mock role finding
        mockPrisma.role.findFirst.mockResolvedValue({ id: 1, name: 'TEACHER' });
        // Mock user creation
        mockPrisma.user.create.mockResolvedValue({ id: 99, name: 'John Doe' });
        // Mock profile creation
        mockPrisma.teacherProfile.create.mockResolvedValue({ id: 100, userId: 99 });

        await service.create(1, dto as any);

        expect(mockPrisma.teacherPreferredSubject.createMany).toHaveBeenCalledWith({
            data: [
                { teacherId: 100, subjectId: 1 },
                { teacherId: 100, subjectId: 2 },
            ],
        });

        expect(mockPrisma.teacherSkill.createMany).toHaveBeenCalledWith({
            data: [
                { teacherId: 100, name: 'Coding' },
                { teacherId: 100, name: 'Music' },
            ],
        });

        expect(mockPrisma.teacherResponsibility.createMany).toHaveBeenCalledWith({
            data: [{ teacherId: 100, roleName: 'House Master' }]
        });
    });
});
