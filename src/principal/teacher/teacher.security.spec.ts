import { Test, TestingModule } from '@nestjs/testing';
import { TeacherService } from './teacher.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('TeacherService Multi-Tenant Leakage Protection', () => {
    let service: TeacherService;
    let prisma: PrismaService;

    const mockPrisma = {
        teacherProfile: {
            findFirst: jest.fn(),
        }
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TeacherService,
                { provide: PrismaService, useValue: mockPrisma },
            ],
        }).compile();

        service = module.get<TeacherService>(TeacherService);
    });

    it('should NOT allow access to a teacher profile from another school', async () => {
        const mySchoolId = 1;
        const anotherSchoolTeacherId = 999;

        // Mock findFirst to return null when filtered by schoolId
        mockPrisma.teacherProfile.findFirst.mockResolvedValue(null);

        await expect(service.findOne(mySchoolId, anotherSchoolTeacherId))
            .rejects.toThrow(NotFoundException);

        expect(mockPrisma.teacherProfile.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                id: anotherSchoolTeacherId,
                schoolId: mySchoolId
            })
        }));
    });
});
