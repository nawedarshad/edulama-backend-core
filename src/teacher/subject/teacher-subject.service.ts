import { Injectable, NotFoundException, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSyllabusDto } from './dto/create-syllabus.dto';

@Injectable()
export class TeacherSubjectService {
    private readonly logger = new Logger(TeacherSubjectService.name);

    constructor(private readonly prisma: PrismaService) { }

    // 1. Get All Assigned Subjects
    async findAll(schoolId: number, userId: number) {
        // First get the teacher profile id
        const teacher = await this.prisma.teacherProfile.findUnique({
            where: { userId },
            select: { id: true }
        });

        if (!teacher) {
            throw new ForbiddenException('Teacher profile not found');
        }

        const assignments = await this.prisma.subjectAssignment.findMany({
            where: {
                schoolId,
                teacherId: teacher.id,
                isActive: true
            },
            include: {
                subject: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                        icon: true,
                        color: true
                    }
                },
                class: {
                    select: {
                        id: true,
                        name: true
                    }
                },
                section: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            },
            orderBy: [
                { class: { name: 'asc' } },
                { section: { name: 'asc' } }
            ]
        });

        return assignments.map(a => ({
            assignmentId: a.id,
            subject: a.subject,
            class: a.class,
            section: a.section,
            periodsPerWeek: a.periodsPerWeek
        }));
    }

    // 2. Get Single Subject Assignment Details
    async findOne(schoolId: number, userId: number, assignmentId: number) {
        // Check ownership
        const teacher = await this.prisma.teacherProfile.findUnique({
            where: { userId },
            select: { id: true }
        });

        if (!teacher) {
            throw new ForbiddenException('Teacher profile not found');
        }

        const assignment = await this.prisma.subjectAssignment.findUnique({
            where: { id: assignmentId },
            include: {
                subject: true,
                class: true,
                section: true,
                academicYear: true
            }
        });

        if (!assignment || assignment.schoolId !== schoolId) {
            throw new NotFoundException('Subject assignment not found');
        }

        if (assignment.teacherId !== teacher.id) {
            throw new ForbiddenException('You are not assigned to this subject');
        }

        // Fetch Syllabus
        const syllabi = await this.prisma.syllabus.findMany({
            where: {
                schoolId,
                classId: assignment.classId,
                subjectId: assignment.subjectId,
                academicYearId: assignment.academicYearId
            },
            orderBy: { createdAt: 'desc' }
        });

        // Fetch Recent Class Diaries
        const diaries = await this.prisma.classDiary.findMany({
            where: {
                schoolId,
                classId: assignment.classId,
                sectionId: assignment.sectionId!, // Section is mandatory for diary usually, but handle null if needed
                subjectId: assignment.subjectId
            },
            orderBy: { lessonDate: 'desc' },
            take: 5
        });

        // Count Students
        const studentCount = await this.prisma.studentProfile.count({
            where: {
                schoolId,
                classId: assignment.classId,
                sectionId: assignment.sectionId!,
                isActive: true
            }
        });

        return {
            assignment: {
                assignmentId: assignment.id,
                subject: assignment.subject,
                class: assignment.class,
                section: assignment.section,
                periodsPerWeek: assignment.periodsPerWeek
            },
            syllabi,
            recentDiaries: diaries,
            studentCount
        };
    }

    // 3. Add Syllabus
    async addSyllabus(schoolId: number, userId: number, assignmentId: number, dto: CreateSyllabusDto) {
        // Check ownership
        const teacher = await this.prisma.teacherProfile.findUnique({
            where: { userId },
            select: { id: true }
        });

        if (!teacher) {
            throw new ForbiddenException('Teacher profile not found');
        }

        const assignment = await this.prisma.subjectAssignment.findUnique({
            where: { id: assignmentId }
        });

        if (!assignment || assignment.schoolId !== schoolId) {
            throw new NotFoundException('Subject assignment not found');
        }

        if (assignment.teacherId !== teacher.id) {
            throw new ForbiddenException('You are not assigned to this subject');
        }

        return this.prisma.syllabus.create({
            data: {
                schoolId,
                academicYearId: assignment.academicYearId,
                classId: assignment.classId,
                subjectId: assignment.subjectId,
                title: dto.title,
                description: dto.description,
                attachments: dto.attachments ?? [],
                parentId: dto.parentId,
                orderIndex: dto.orderIndex ?? 0,
                learningOutcomes: dto.learningOutcomes,
                estimatedHours: dto.estimatedHours,
                status: dto.status ?? 'PLANNED',
                type: dto.type ?? 'TOPIC',
                isCompleted: dto.status === 'COMPLETED'
            }
        });
    }

    // 4. Update Syllabus Status
    async updateSyllabusStatus(schoolId: number, userId: number, assignmentId: number, syllabusId: number, statusInput: string | boolean) {
        // Ownership check
        const teacher = await this.prisma.teacherProfile.findUnique({
            where: { userId },
            select: { id: true }
        });

        if (!teacher) throw new ForbiddenException('Teacher profile not found');

        const assignment = await this.prisma.subjectAssignment.findFirst({
            where: { id: assignmentId, schoolId, teacherId: teacher.id }
        });

        if (!assignment) throw new ForbiddenException('Assignment not accessible');

        const syllabus = await this.prisma.syllabus.findUnique({
            where: { id: syllabusId }
        });

        if (!syllabus || syllabus.classId !== assignment.classId || syllabus.subjectId !== assignment.subjectId) {
            throw new NotFoundException('Syllabus item not found or does not belong to this subject');
        }

        let newStatus: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'DEFERRED' = 'PLANNED';
        let isCompleted = false;

        if (typeof statusInput === 'boolean') {
            // Backward compatibility
            isCompleted = statusInput;
            newStatus = statusInput ? 'COMPLETED' : 'PLANNED';
        } else {
            newStatus = statusInput as any;
            isCompleted = newStatus === 'COMPLETED';
        }

        return this.prisma.syllabus.update({
            where: { id: syllabusId },
            data: {
                status: newStatus,
                isCompleted,
                completedAt: isCompleted ? new Date() : null
            }
        });
    }

    // 5. Update Syllabus Details
    async updateSyllabus(schoolId: number, userId: number, assignmentId: number, syllabusId: number, dto: CreateSyllabusDto) {
        const teacher = await this.prisma.teacherProfile.findUnique({
            where: { userId },
            select: { id: true }
        });
        if (!teacher) throw new ForbiddenException('Teacher profile not found');

        const assignment = await this.prisma.subjectAssignment.findFirst({
            where: { id: assignmentId, schoolId, teacherId: teacher.id }
        });
        if (!assignment) throw new ForbiddenException('Assignment not accessible');

        // Check existence and ownership of syllabus item
        const existingSyllabus = await this.prisma.syllabus.findFirst({
            where: {
                id: syllabusId,
                classId: assignment.classId,
                subjectId: assignment.subjectId
            }
        });

        if (!existingSyllabus) throw new NotFoundException('Syllabus item not found');

        return this.prisma.syllabus.update({
            where: { id: syllabusId },
            data: {
                title: dto.title,
                description: dto.description,
                attachments: dto.attachments ?? existingSyllabus.attachments,
                parentId: dto.parentId,
                orderIndex: dto.orderIndex,
                learningOutcomes: dto.learningOutcomes,
                estimatedHours: dto.estimatedHours,
                status: dto.status,
                type: dto.type,
                isCompleted: dto.status === 'COMPLETED' ? true : (dto.status ? false : existingSyllabus.isCompleted)
            }
        });
    }

    // 6. Delete Syllabus
    async deleteSyllabus(schoolId: number, userId: number, assignmentId: number, syllabusId: number) {
        const teacher = await this.prisma.teacherProfile.findUnique({
            where: { userId },
            select: { id: true }
        });
        if (!teacher) throw new ForbiddenException('Teacher profile not found');

        const assignment = await this.prisma.subjectAssignment.findFirst({
            where: { id: assignmentId, schoolId, teacherId: teacher.id }
        });
        if (!assignment) throw new ForbiddenException('Assignment not accessible');

        const existingSyllabus = await this.prisma.syllabus.findFirst({
            where: {
                id: syllabusId,
                classId: assignment.classId,
                subjectId: assignment.subjectId
            }
        });

        if (!existingSyllabus) throw new NotFoundException('Syllabus item not found');

        // Note: If syllabus has children, this might fail unless cascade delete is enabled in DB
        // or we handle recursive delete. Assuming generic Prisma handling for now.
        return this.prisma.syllabus.delete({
            where: { id: syllabusId }
        });
    }
}
