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
            assignment,
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
                attachments: dto.attachments ?? []
            }
        });
    }

    // 4. Update Syllabus Status
    async updateSyllabusStatus(schoolId: number, userId: number, assignmentId: number, syllabusId: number, isCompleted: boolean) {
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

        // Check if syllabus belongs to this context (optional but safer)
        const syllabus = await this.prisma.syllabus.findUnique({
            where: { id: syllabusId }
        });

        if (!syllabus || syllabus.classId !== assignment.classId || syllabus.subjectId !== assignment.subjectId) {
            throw new NotFoundException('Syllabus item not found or does not belong to this subject');
        }

        return this.prisma.syllabus.update({
            where: { id: syllabusId },
            data: {
                isCompleted,
                completedAt: isCompleted ? new Date() : null
            }
        });
    }
}
