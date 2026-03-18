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
            include: { academicGroups: { select: { id: true } } }
        });

        if (!student) throw new NotFoundException('Student not found');

        const groupIds = student.academicGroups.map(g => g.id);

        const assignments = await this.prisma.subjectAssignment.findMany({
            where: {
                schoolId,
                isActive: true,
                academicYearId: student.academicYearId,
                OR: [
                    { groupId: { in: groupIds } },
                    { 
                        classId: student.classId,
                        sectionId: student.sectionId
                    }
                ]
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
                },
                class: { select: { id: true, name: true } },
                section: { select: { id: true, name: true } }
            }
        });

        return Promise.all(assignments.map(async (a) => {
            const totalTopics = await this.prisma.syllabus.count({
                where: {
                    schoolId,
                    subjectId: a.subjectId,
                    academicYearId: a.academicYearId,
                    type: 'TOPIC',
                    ...(a.groupId ? { groupId: a.groupId } : { classId: a.classId })
                }
            });

            const completedTopics = await this.prisma.syllabus.count({
                where: {
                    schoolId,
                    subjectId: a.subjectId,
                    academicYearId: a.academicYearId,
                    type: 'TOPIC',
                    status: 'COMPLETED',
                    ...(a.groupId ? { groupId: a.groupId } : { classId: a.classId })
                }
            });

            return {
                assignmentId: a.id,
                subject: a.subject,
                teacher: a.teacher,
                class: a.class,
                section: a.section,
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
                subjectId: assignment.subjectId,
                academicYearId: assignment.academicYearId,
                ...(assignment.groupId ? { groupId: assignment.groupId } : {
                    classId: assignment.classId
                }),
            },
        });
        
        // Fetch recent diaries
        const recentDiaries = await this.prisma.classDiary.findMany({
            where: {
                schoolId,
                subjectId: assignment.subjectId,
                academicYearId: assignment.academicYearId,
                ...(assignment.groupId ? { groupId: assignment.groupId } : {
                    classId: assignment.classId,
                    sectionId: assignment.sectionId
                }),
            },
            take: 5,
            orderBy: { lessonDate: 'desc' }
        });

        return {
            assignment: {
                assignmentId: assignment.id,
                subject: assignment.subject,
                teacher: assignment.teacher,
                periodsPerWeek: assignment.periodsPerWeek
            },
            syllabi,
            recentDiaries,
            studentCount: 0 // Not relevant for parents in this view
        };
    }

    async getSyllabusFiles(schoolId: number, parentUserId: number, studentId: number, assignmentId: number) {
        await this.validateParentChildLink(schoolId, parentUserId, studentId);

        const assignment = await this.prisma.subjectAssignment.findUnique({
            where: { id: assignmentId }
        });

        if (!assignment || assignment.schoolId !== schoolId) {
            throw new NotFoundException('Subject assignment not found');
        }

        return this.prisma.syllabusFile.findMany({
            where: { schoolId, subjectAssignmentId: assignmentId },
            orderBy: { uploadedAt: 'desc' }
        });
    }
}
