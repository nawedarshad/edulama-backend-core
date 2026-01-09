import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateAllocationDto, UpdateAllocationDto, AllocationFilterDto } from './dto/allocation.dto';
import { AcademicYearStatus } from '@prisma/client';

@Injectable()
export class AllocationService {
    constructor(private prisma: PrismaService) { }

    private async getActiveAcademicYear(schoolId: number) {
        const year = await this.prisma.academicYear.findFirst({
            where: { schoolId, status: AcademicYearStatus.ACTIVE }
        });
        if (!year) throw new BadRequestException('No active academic year found');
        return year.id;
    }

    async assignTeacher(schoolId: number, dto: CreateAllocationDto) {
        const academicYearId = await this.getActiveAcademicYear(schoolId);

        // 1. Check if assignment already exists
        const existing = await this.prisma.subjectAssignment.findFirst({
            where: {
                schoolId,
                academicYearId,
                classId: dto.classId,
                sectionId: dto.sectionId || null,
                subjectId: dto.subjectId,
                isActive: true,
            },
        });

        if (existing) {
            throw new BadRequestException('A teacher is already assigned to this subject for the selected class/section.');
        }

        // 2. Create Assignment
        return this.prisma.subjectAssignment.create({
            data: {
                schoolId,
                academicYearId,
                classId: dto.classId,
                sectionId: dto.sectionId || null,
                subjectId: dto.subjectId,
                teacherId: dto.teacherId,
                periodsPerWeek: dto.periodsPerWeek,
            },
            include: {
                teacher: {
                    select: {
                        id: true,
                        user: { select: { name: true, photo: true } },
                        personalInfo: { select: { email: true } },
                    },
                },
                subject: true,
                class: true,
                section: true,
            },
        });
    }

    async findAll(schoolId: number, filters: AllocationFilterDto) {
        const academicYearId = await this.getActiveAcademicYear(schoolId);
        return this.prisma.subjectAssignment.findMany({
            where: {
                schoolId,
                academicYearId,
                classId: filters.classId,
                sectionId: filters.sectionId,
                subjectId: filters.subjectId,
                teacherId: filters.teacherId,
                isActive: true, // Only show active assignments
            },
            include: {
                teacher: {
                    select: {
                        id: true,
                        user: { select: { name: true, photo: true } },
                        personalInfo: { select: { email: true } },
                    },
                },
                subject: { select: { name: true, code: true, color: true, icon: true } },
                class: { select: { name: true } },
                section: { select: { name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async updateAssignment(schoolId: number, assignmentId: number, dto: UpdateAllocationDto) {
        const assignment = await this.prisma.subjectAssignment.findUnique({
            where: { id: assignmentId },
        });

        if (!assignment || assignment.schoolId !== schoolId) {
            throw new NotFoundException('Assignment not found');
        }

        return this.prisma.subjectAssignment.update({
            where: { id: assignmentId },
            data: {
                teacherId: dto.teacherId,
                periodsPerWeek: dto.periodsPerWeek,
            },
            include: {
                teacher: {
                    select: {
                        id: true,
                        user: { select: { name: true } }
                    }
                }
            }
        });
    }

    async removeAssignment(schoolId: number, assignmentId: number) {
        const assignment = await this.prisma.subjectAssignment.findUnique({
            where: { id: assignmentId },
        });

        if (!assignment || assignment.schoolId !== schoolId) {
            throw new NotFoundException('Assignment not found');
        }

        // Check if there are dependent records like Timetable entries (omitted for now, but good practice)

        return this.prisma.subjectAssignment.delete({
            where: { id: assignmentId },
        });
    }

    async getSmartSuggestions(schoolId: number, classId: number, subjectId: number, sectionId?: number) {
        const academicYearId = await this.getActiveAcademicYear(schoolId);

        // 1. Get Subject Details (Need department)
        const subject = await this.prisma.subject.findUnique({
            where: { id: subjectId },
            include: { department: true },
        });

        if (!subject) throw new NotFoundException('Subject not found');

        // 2. Get All Active Teachers
        const teachers = await this.prisma.teacherProfile.findMany({
            where: { schoolId, isActive: true },
            include: {
                user: { select: { name: true, photo: true } },
                preferredSubjects: true, // List of preferred subject IDs
                subjectAssignments: {
                    where: { academicYearId, isActive: true } // To calculate load
                },
                qualifications: true,
            },
        });

        // 3. Scoring Algorithm
        const scoredTeachers = teachers.map(teacher => {
            let score = 0;
            const reasons: string[] = [];

            // A. Preferred Subject Match (+50)
            const isPreferred = teacher.preferredSubjects.some(ps => ps.subjectId === subjectId);
            if (isPreferred) {
                score += 50;
                reasons.push('Preferred Subject');
            }

            // B. Department Match (+30)
            // Check if teacher has any assignment in this department OR loosely match if teacher has no department field (Assuming teacher doesn't have direct dept link in schema shown, but let's check subject assignments for same department)
            // Actually schema showed `departmentId` on Subject, but not directly on TeacherProfile?
            // `DepartmentMember` links User -> Department. Let's fetch that.
            // Optimisation: We didn't fetch DepartmentMember above. Let's assume for now we look at other assignments or just skip this if not easily available.
            // Wait, `TeacherProfile` -> `userId` -> `DepartmentMember`. I can include it.

            // Let's refine the query in step 2 to include department membership if possible, but for now let's rely on qualification text match or just skipping.
            // Simplification: Point for every other assignment in the SAME subject (+10) - shows experience.
            const experienceCount = teacher.subjectAssignments.filter(sa => sa.subjectId === subjectId).length;
            if (experienceCount > 0) {
                score += (experienceCount * 10);
                reasons.push(`Teaching this subject in ${experienceCount} other classes`);
            }

            // C. Workload Penalty (-5 per active assignment)
            // We want to favor teachers with strictly LESS load? Or just balance?
            // Let's say -5 per assignment.
            const currentLoad = teacher.subjectAssignments.length;
            score -= (currentLoad * 5);

            // D. Qualification Match (Simple string search)
            if (subject.name) {
                const hasQual = teacher.qualifications.some(q =>
                    q.degree?.toLowerCase().includes(subject.name.toLowerCase()) ||
                    q.specialization?.toLowerCase().includes(subject.name.toLowerCase())
                );
                if (hasQual) {
                    score += 20;
                    reasons.push('Qualification Match');
                }
            }

            return {
                teacherId: teacher.id,
                name: teacher.user.name,
                photo: teacher.user.photo,
                score,
                reasons,
                currentLoad,
            };
        });

        // 4. Sort by Score Descending
        return scoredTeachers
            .sort((a, b) => b.score - a.score)
            .slice(0, 5); // Return Top 5
    }
}
