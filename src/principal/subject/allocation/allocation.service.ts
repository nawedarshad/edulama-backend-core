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

        // 0. Validate that all referenced entities belong to this school
        const teacher = await this.prisma.teacherProfile.findFirst({
            where: { id: dto.teacherId, schoolId }
        });
        if (!teacher) throw new NotFoundException('Teacher not found or does not belong to this school');

        const subject = await this.prisma.subject.findFirst({
            where: { id: dto.subjectId, schoolId }
        });
        if (!subject) throw new NotFoundException('Subject not found or does not belong to this school');

        const classRecord = await this.prisma.class.findFirst({
            where: { id: dto.classId, schoolId }
        });
        if (!classRecord) throw new NotFoundException('Class not found or does not belong to this school');

        if (dto.sectionId) {
            const section = await this.prisma.section.findFirst({
                where: { id: dto.sectionId, classId: dto.classId, schoolId }
            });
            if (!section) throw new NotFoundException('Section not found or does not belong to the specified class');
        }

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

        // 2. Create Assignment within Transaction to ensure sync with ClassSubject Config
        const assignment = await this.prisma.$transaction(async (tx) => {
            const asm = await tx.subjectAssignment.create({
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

            // SYNC: Update the configuration table to reflect this teacher
            // This ensures both tables (Phase 1 Config and Phase 2 Assignment) are in lock-step
            if (dto.classId && dto.sectionId) {
                await tx.classSubject.updateMany({
                    where: {
                        schoolId,
                        academicYearId,
                        classId: dto.classId,
                        sectionId: dto.sectionId,
                        subjectId: dto.subjectId
                    },
                    data: {
                        teacherProfileId: dto.teacherId
                    }
                });
            }

            return asm;
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
        const assignment = await this.prisma.subjectAssignment.findFirst({
            where: { id: assignmentId, schoolId },
            include: { subject: true, class: true }
        });

        if (!assignment) {
            throw new NotFoundException('Assignment not found');
        }

        if (dto.teacherId !== undefined) {
            const teacher = await this.prisma.teacherProfile.findFirst({
                where: { id: dto.teacherId, schoolId }
            });
            if (!teacher) throw new NotFoundException('Teacher not found or does not belong to this school');
        }

        const updated = await this.prisma.$transaction(async (tx) => {
            const upd = await tx.subjectAssignment.update({
                where: { id: assignmentId },
                data: {
                    ...(dto.teacherId !== undefined && { teacherId: dto.teacherId }),
                    ...(dto.periodsPerWeek !== undefined && { periodsPerWeek: dto.periodsPerWeek }),
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

            // SYNC: Keep config in sync — only when teacherId is explicitly updated
            if (dto.teacherId !== undefined && assignment.classId && assignment.sectionId) {
                await tx.classSubject.updateMany({
                    where: {
                        schoolId,
                        academicYearId: assignment.academicYearId,
                        classId: assignment.classId,
                        sectionId: assignment.sectionId,
                        subjectId: assignment.subjectId
                    },
                    data: {
                        teacherProfileId: dto.teacherId
                    }
                });
            }

            return upd;
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
        const assignment = await this.prisma.subjectAssignment.findFirst({
            where: { id: assignmentId, schoolId },
            include: { subject: true, class: true }
        });

        if (!assignment) {
            throw new NotFoundException('Assignment not found');
        }

        // Check if there are dependent records like Timetable entries (omitted for now, but good practice)

        const deleted = await this.prisma.$transaction(async (tx) => {
            const del = await tx.subjectAssignment.delete({
                where: { id: assignmentId },
            });

            // SYNC: Clear the configuration table if assignment is removed
            if (assignment.classId && assignment.sectionId) {
                await tx.classSubject.updateMany({
                    where: {
                        schoolId,
                        academicYearId: assignment.academicYearId,
                        classId: assignment.classId,
                        sectionId: assignment.sectionId,
                        subjectId: assignment.subjectId
                    },
                    data: {
                        teacherProfileId: null
                    }
                });
            }

            return del;
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
        const subject = await this.prisma.subject.findFirst({
            where: { id: subjectId, schoolId },
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
