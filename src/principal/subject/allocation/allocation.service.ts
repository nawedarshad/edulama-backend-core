import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateAllocationDto, UpdateAllocationDto, AllocationFilterDto } from './dto/allocation.dto';
import { AcademicYearStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditLogEvent } from '../../../common/audit/audit.event';

@Injectable()
export class AllocationService {
    constructor(
        private prisma: PrismaService,
        private eventEmitter: EventEmitter2
    ) { }

    private async getActiveAcademicYear(schoolId: number) {
        const year = await this.prisma.academicYear.findFirst({
            where: { schoolId, status: AcademicYearStatus.ACTIVE }
        });
        if (!year) throw new BadRequestException('No active academic year found');
        return year.id;
    }

    async assignTeacher(schoolId: number, dto: CreateAllocationDto, userId: number) {
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
        const assignment = await this.prisma.subjectAssignment.create({
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

        this.eventEmitter.emit('audit.log', new AuditLogEvent(
            schoolId,
            userId,
            'SUBJECT_ALLOCATION',
            'CREATE',
            assignment.id,
            dto
        ));

        return assignment;
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

    async updateAssignment(schoolId: number, assignmentId: number, dto: UpdateAllocationDto, userId: number) {
        const assignment = await this.prisma.subjectAssignment.findUnique({
            where: { id: assignmentId },
            include: { subject: true, class: true }
        });

        if (!assignment || assignment.schoolId !== schoolId) {
            throw new NotFoundException('Assignment not found');
        }

        const updated = await this.prisma.subjectAssignment.update({
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

        this.eventEmitter.emit('audit.log', new AuditLogEvent(
            schoolId,
            userId,
            'SUBJECT_ALLOCATION',
            'UPDATE',
            assignmentId,
            dto
        ));

        return updated;
    }

    async removeAssignment(schoolId: number, assignmentId: number, userId: number) {
        const assignment = await this.prisma.subjectAssignment.findUnique({
            where: { id: assignmentId },
            include: { subject: true, class: true }
        });

        if (!assignment || assignment.schoolId !== schoolId) {
            throw new NotFoundException('Assignment not found');
        }

        // Check if there are dependent records like Timetable entries (omitted for now, but good practice)

        const deleted = await this.prisma.subjectAssignment.delete({
            where: { id: assignmentId },
        });

        this.eventEmitter.emit('audit.log', new AuditLogEvent(
            schoolId,
            userId,
            'SUBJECT_ALLOCATION',
            'DELETE',
            assignmentId
        ));

        return deleted;
    }

    async getSmartSuggestions(schoolId: number, classId: number, subjectId: number, sectionId?: number) {
        const academicYearId = await this.getActiveAcademicYear(schoolId);

        // 1. Get Subject Details
        const subject = await this.prisma.subject.findUnique({
            where: { id: subjectId },
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

            // B. Experience Match (+10 per other assignment)
            // Point for every other assignment in the SAME subject (+10) - shows experience.
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
