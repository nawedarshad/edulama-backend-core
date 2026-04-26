import { Test, TestingModule } from '@nestjs/testing';
import { SubjectService } from './subject.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AcademicYearStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('SubjectService', () => {
    let service: SubjectService;
    let prisma: PrismaService;
    let eventEmitter: EventEmitter2;

    const mockPrismaService = {
        academicYear: { findFirst: jest.fn() },
        subject: {
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            count: jest.fn(),
            groupBy: jest.fn(),
        },
        subjectCategory: {
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        },
        section: {
            findFirst: jest.fn(),
            findMany: jest.fn(),
        },
        classSubject: {
            create: jest.fn(),
            createMany: jest.fn(),
            findFirst: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
            upsert: jest.fn(),
        },
        teacherProfile: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
        },
        subjectAssignment: {
            upsert: jest.fn(),
            groupBy: jest.fn(),
        },
        $transaction: jest.fn((cb) => cb(mockPrismaService)),
    };

    const mockEventEmitter = {
        emit: jest.fn(),
    };

    const mockSchoolId = 1;
    const mockAcademicYear = { id: 100, schoolId: mockSchoolId, status: AcademicYearStatus.ACTIVE };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SubjectService,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: EventEmitter2, useValue: mockEventEmitter },
            ],
        }).compile();

        service = module.get<SubjectService>(SubjectService);
        prisma = module.get<PrismaService>(PrismaService);
        eventEmitter = module.get<EventEmitter2>(EventEmitter2);
        
        jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});
    });

    describe('create', () => {
        it('should create subject and emit audit log', async () => {
            mockPrismaService.subject.findUnique.mockResolvedValue(null);
            mockPrismaService.subject.create.mockResolvedValue({ id: 1, name: 'Math' });

            await service.create(mockSchoolId, { name: 'Math', code: 'MATH' }, 101);

            expect(mockPrismaService.subject.create).toHaveBeenCalled();
            expect(mockEventEmitter.emit).toHaveBeenCalledWith('audit.log', expect.anything());
        });
    });

    describe('assignToClass', () => {
        it('should perform bulk assignment to all sections if sectionId is omitted', async () => {
            mockPrismaService.academicYear.findFirst.mockResolvedValue(mockAcademicYear);
            mockPrismaService.subject.findFirst.mockResolvedValue({ id: 1, name: 'Math', code: 'M1' });
            mockPrismaService.section.findMany.mockResolvedValue([{ id: 10, name: 'A' }, { id: 11, name: 'B' }]);

            const result = await service.assignToClass(mockSchoolId, {
                classId: 5,
                subjectId: 1,
                weeklyClasses: 5
            }, 101);

            expect(result.message).toContain('Assigned to 2 sections');
            expect(mockPrismaService.$transaction).toHaveBeenCalled();
        });

        it('should throw error if credits are negative', async () => {
            mockPrismaService.academicYear.findFirst.mockResolvedValue(mockAcademicYear);
            await expect(service.assignToClass(mockSchoolId, {
                classId: 5, subjectId: 1, credits: -1
            }, 101)).rejects.toThrow(BadRequestException);
        });
    });

    describe('Intelligent Allocation (getTeacherSuggestions)', () => {
        it('should rank teachers correctly based on preference and workload', async () => {
            mockPrismaService.academicYear.findFirst.mockResolvedValue(mockAcademicYear);
            mockPrismaService.subject.findUnique.mockResolvedValue({ id: 1, name: 'Physics' });
            
            mockPrismaService.teacherProfile.findMany.mockResolvedValue([
                { 
                    id: 1, user: { name: 'Pref Teacher' }, 
                    preferredSubjects: [{ subjectId: 1 }],
                    qualifications: []
                },
                { 
                    id: 2, user: { name: 'NoPref Teacher' }, 
                    preferredSubjects: [],
                    qualifications: []
                }
            ]);

            mockPrismaService.subjectAssignment.groupBy.mockResolvedValue([
                { teacherId: 1, _count: 2 }
            ]);

            const result = await service.getTeacherSuggestions(mockSchoolId, 1, 5);

            expect(result[0].teacherId).toBe(1);
            expect(result[0].score).toBe(40); // 50 (pref) - 10 (load)
            expect(result[1].score).toBe(0);
        });

        it('should award +30 for matching qualification specialization', async () => {
            mockPrismaService.academicYear.findFirst.mockResolvedValue(mockAcademicYear);
            mockPrismaService.subject.findUnique.mockResolvedValue({ id: 1, name: 'Science' });
            
            mockPrismaService.teacherProfile.findMany.mockResolvedValue([
                { 
                    id: 3, user: { name: 'Expert' }, 
                    preferredSubjects: [],
                    qualifications: [{ specialization: 'Science Specialist', degree: 'MSc' }]
                }
            ]);
            mockPrismaService.subjectAssignment.groupBy.mockResolvedValue([]);

            const result = await service.getTeacherSuggestions(mockSchoolId, 1, 5);
            expect(result[0].score).toBe(30);
            expect(result[0].reasons).toContain('Specialized in Science Specialist');
        });
    });

    describe('bulkCopy', () => {
        it('should copy configurations from source class to target sections', async () => {
            mockPrismaService.academicYear.findFirst.mockResolvedValue(mockAcademicYear);
            mockPrismaService.classSubject.findMany.mockResolvedValue([
                { subjectId: 1, type: 'CORE', credits: 4 }
            ]);
            mockPrismaService.section.findMany.mockResolvedValue([{ id: 20, name: 'Target' }]);

            const result = await service.bulkCopy(mockSchoolId, {
                fromClassId: 1,
                toClassId: 2,
                copyTeachers: false
            }, 101);

            expect(result.message).toContain('Successfully copied');
        });
    });
});
