import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ParentSubjectService {
    constructor(private readonly prisma: PrismaService) { }

    private async validateParentChildLink(schoolId: number, parentUserId: number, studentId: number) {
        const link = await this.prisma.parentStudent.findFirst({
            where: {
                parent: { userId: parentUserId },
                student: { id: studentId, schoolId }
            }
        });

        if (!link) {
            throw new ForbiddenException('You can only access subjects for your own children.');
        }
    }

    async findAll(schoolId: number, parentUserId: number, studentId: number) {
        await this.validateParentChildLink(schoolId, parentUserId, studentId);

        const student = await this.prisma.studentProfile.findUnique({
            where: { id: studentId },
            select: { sectionId: true, classId: true }
        });

        if (!student) throw new NotFoundException('Student not found');

        const group = await this.prisma.academicGroup.findFirst({
            where: { schoolId, classId: student.classId, sectionId: student.sectionId }
        });

        if (!group) throw new NotFoundException('Academic group not found for student');

        const assignments = await this.prisma.subjectAssignment.findMany({
            where: {
                schoolId,
                groupId: group.id,
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
                teacher: {
                    select: {
                        id: true,
                        user: { select: { name: true } }
                    }
                }
            }
        });

        return Promise.all(assignments.map(async (a) => {
            const totalTopics = await this.prisma.syllabus.count({
                where: {
                    schoolId,
                    groupId: a.groupId,
                    subjectId: a.subjectId,
                    academicYearId: a.academicYearId,
                    type: 'TOPIC'
                }
            });

            const completedTopics = await this.prisma.syllabus.count({
                where: {
                    schoolId,
                    groupId: a.groupId,
                    subjectId: a.subjectId,
                    academicYearId: a.academicYearId,
                    type: 'TOPIC',
                    status: 'COMPLETED'
                }
            });

            return {
                assignmentId: a.id,
                subject: a.subject,
                teacher: a.teacher,
                periodsPerWeek: a.periodsPerWeek,
                syllabusProgress: {
                    total: totalTopics,
                    completed: completedTopics,
                    percentage: totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0
                }
            };
        }));
    }

    async findOne(schoolId: number, parentUserId: number, studentId: number, assignmentId: number) {
        await this.validateParentChildLink(schoolId, parentUserId, studentId);

        const assignment = await this.prisma.subjectAssignment.findUnique({
            where: { id: assignmentId },
            include: {
                subject: true,
                academicYear: true,
                group: true,
                teacher: { select: { id: true, user: { select: { name: true } } } }
            }
        });

        if (!assignment || assignment.schoolId !== schoolId) {
            throw new NotFoundException('Subject assignment not found');
        }

        // Fetch Syllabus
        const syllabi = await this.prisma.syllabus.findMany({
            where: {
                schoolId,
                groupId: assignment.groupId,
                subjectId: assignment.subjectId,
                academicYearId: assignment.academicYearId
            },
            orderBy: { createdAt: 'desc' }
        });

        return {
            assignment: {
                assignmentId: assignment.id,
                subject: assignment.subject,
                teacher: assignment.teacher,
                periodsPerWeek: assignment.periodsPerWeek
            },
            syllabi,
            studentCount: 0 // Not relevant for parents in this view
        };
    }
}
