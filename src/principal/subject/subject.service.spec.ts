import { Test, TestingModule } from '@nestjs/testing';
import { SubjectService } from './subject.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { CreateSubjectDto, UpdateSubjectDto, CreateClassSubjectDto } from './dto/subject.dto';
import { AcademicYearStatus } from '@prisma/client';

describe('SubjectService', () => {
    let service: SubjectService;
    let prisma: PrismaService;

    const mockPrismaService = {
        academicYear: {
            findFirst: jest.fn(),
        },
        subject: {
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            count: jest.fn(),
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
            findFirst: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
        }
    };

    const mockSchoolId = 1;
    const mockAcademicYear = { id: 100, schoolId: mockSchoolId, status: AcademicYearStatus.ACTIVE };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SubjectService,
                {
                    provide: PrismaService,
                    useValue: mockPrismaService,
                },
            ],
        }).compile();

        service = module.get<SubjectService>(SubjectService);
        prisma = module.get<PrismaService>(PrismaService);
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('create', () => {
        it('should create a subject if it does not exist in the active academic year', async () => {
            mockPrismaService.academicYear.findFirst.mockResolvedValue(mockAcademicYear);
            mockPrismaService.subject.findUnique.mockResolvedValue(null);
            mockPrismaService.subject.create.mockResolvedValue({ id: 1, name: 'Math' });

            const dto: CreateSubjectDto = { name: 'Math', code: 'MATH101' };
            const result = await service.create(mockSchoolId, dto);

            expect(mockPrismaService.academicYear.findFirst).toHaveBeenCalledWith({
                where: { schoolId: mockSchoolId, status: AcademicYearStatus.ACTIVE }
            });
            expect(mockPrismaService.subject.create).toHaveBeenCalled();
            expect(result).toEqual({ id: 1, name: 'Math' });
        });

        it('should throw ConflictException if subject code exists in the active academic year', async () => {
            mockPrismaService.academicYear.findFirst.mockResolvedValue(mockAcademicYear);
            mockPrismaService.subject.findUnique.mockResolvedValue({ id: 1 });

            const dto: CreateSubjectDto = { name: 'Math', code: 'MATH101' };

            await expect(service.create(mockSchoolId, dto)).rejects.toThrow(ConflictException);
        });
    });

    describe('findAll', () => {
        it('should return subjects for the active academic year', async () => {
            mockPrismaService.academicYear.findFirst.mockResolvedValue(mockAcademicYear);
            mockPrismaService.subject.findMany.mockResolvedValue([{ id: 1, name: 'Math' }]);

            const result = await service.findAll(mockSchoolId, {});
            expect(mockPrismaService.subject.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: { schoolId: mockSchoolId, academicYearId: mockAcademicYear.id }
            }));
            expect(result).toHaveLength(1);
        });
    });

    describe('findOne', () => {
        it('should return a subject if found', async () => {
            mockPrismaService.subject.findFirst.mockResolvedValue({ id: 1, name: 'Math' });
            const result = await service.findOne(mockSchoolId, 1);
            expect(result).toBeDefined();
        });

        it('should throw NotFoundException if not found', async () => {
            mockPrismaService.subject.findFirst.mockResolvedValue(null);
            await expect(service.findOne(mockSchoolId, 999)).rejects.toThrow(NotFoundException);
        });
    });

    describe('update', () => {
        it('should update a subject', async () => {
            mockPrismaService.subject.findFirst.mockResolvedValue({ id: 1 });
            mockPrismaService.subject.update.mockResolvedValue({ id: 1, name: 'Math Updated' });

            const dto: UpdateSubjectDto = { name: 'Math Updated' };
            const result = await service.update(mockSchoolId, 1, dto);
            expect(result.name).toBe('Math Updated');
        });
    });

    describe('remove', () => {
        it('should remove a subject', async () => {
            mockPrismaService.subject.findFirst.mockResolvedValue({ id: 1 });
            mockPrismaService.subject.delete.mockResolvedValue({ id: 1 });

            await service.remove(mockSchoolId, 1);
            expect(mockPrismaService.subject.delete).toHaveBeenCalledWith({ where: { id: 1 } });
        });

        it('should throw BadRequestException if delete fails (foreign key constraint)', async () => {
            mockPrismaService.subject.findFirst.mockResolvedValue({ id: 1 });
            mockPrismaService.subject.delete.mockRejectedValue(new Error('Constraint'));

            await expect(service.remove(mockSchoolId, 1)).rejects.toThrow(BadRequestException);
        });
    });

    describe('assignToClass', () => {
        it('should assign subject to class/section', async () => {
            mockPrismaService.academicYear.findFirst.mockResolvedValue(mockAcademicYear);
            mockPrismaService.subject.findFirst.mockResolvedValue({ id: 1, code: 'MATH' });
            mockPrismaService.section.findFirst.mockResolvedValue({ id: 10, classId: 5 });
            mockPrismaService.classSubject.create.mockResolvedValue({});

            const dto: CreateClassSubjectDto = { classId: 5, sectionId: 10, subjectId: 1 };
            const result = await service.assignToClass(mockSchoolId, dto);

            expect(result.message).toContain('Assigned to 1 sections');
        });
    });
});
