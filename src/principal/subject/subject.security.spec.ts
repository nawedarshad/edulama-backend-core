import { Test, TestingModule } from '@nestjs/testing';
import { SubjectService } from './subject.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('SubjectService Multi-Tenant Leakage Protection', () => {
    let service: SubjectService;
    let prisma: PrismaService;

    const mockPrismaService = {
        subject: {
            findFirst: jest.fn(),
            findUnique: jest.fn(),
        },
        academicYear: {
            findFirst: jest.fn(),
        }
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SubjectService,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: EventEmitter2, useValue: { emit: jest.fn() } },
            ],
        }).compile();

        service = module.get<SubjectService>(SubjectService);
        prisma = module.get<PrismaService>(PrismaService);
    });

    it('should NOT allow access to another school subject via findOne', async () => {
        const mySchoolId = 1;
        const targetSubjectId = 999; // Belongs to School 2

        // Mock findFirst to return null when scoped by mySchoolId
        mockPrismaService.subject.findFirst.mockResolvedValue(null);

        await expect(service.findOne(mySchoolId, targetSubjectId))
            .rejects.toThrow(NotFoundException);

        expect(mockPrismaService.subject.findFirst).toHaveBeenCalledWith({
            where: { id: targetSubjectId, schoolId: mySchoolId }
        });
    });
});
