import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StudentSubjectService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll(schoolId: number, studentUserId: number) {
        const student = await this.prisma.studentProfile.findUnique({
            where: { userId: studentUserId },
            select: { id: true, sectionId: true, classId: true }
        });

        if (!student) throw new NotFoundException('Student profile not found');

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

    async findOne(schoolId: number, studentUserId: number, assignmentId: number) {
        const student = await this.prisma.studentProfile.findUnique({
            where: { userId: studentUserId },
            select: { id: true }
        });

        if (!student) throw new NotFoundException('Student profile not found');

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

        if (!assignment.groupId) {
            throw new ForbiddenException('Subject assignment is not properly linked to an academic group.');
        }

        // Verify that this student belongs to the group of this assignment
        const groupLink = await this.prisma.academicGroup.findFirst({
            where: {
                id: assignment.groupId,
                schoolId,
                students: { some: { id: student.id } }
            }
        });

        // If not explicitly linked in students array, check class/section match if groupId is null or as backup
        // But usually subject assignments are linked to groups.
        
        // Fetch Syllabus
        const syllabi = await this.prisma.syllabus.findMany({
            where: {
                schoolId,
                groupId: assignment.groupId,
                subjectId: assignment.subjectId,
                academicYearId: assignment.academicYearId
            },
        });

        // Fetch recent diaries
        const recentDiaries = await this.prisma.classDiary.findMany({
            where: {
                schoolId,
                groupId: assignment.groupId as any,
                subjectId: assignment.subjectId,
                academicYearId: assignment.academicYearId
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
            studentCount: 0 
        };
    }

    async getSyllabusFiles(schoolId: number, studentUserId: number, assignmentId: number) {
        const student = await this.prisma.studentProfile.findUnique({
            where: { userId: studentUserId },
            select: { id: true, classId: true, sectionId: true }
        });

        if (!student) throw new NotFoundException('Student profile not found');

        const assignment = await this.prisma.subjectAssignment.findUnique({
            where: { id: assignmentId }
        });

        if (!assignment || assignment.schoolId !== schoolId) {
            throw new NotFoundException('Subject assignment not found');
        }

        // Verify that this student belongs to the group of this assignment
        const groupLink = assignment.groupId ? await this.prisma.academicGroup.findFirst({
            where: {
                id: assignment.groupId as number,
                schoolId,
                students: { some: { id: student.id } }
            }
        }) : null;

        // Optional: allow access if student's class/section matches the group's class/section
        if (!groupLink && assignment.groupId) {
             const studentFull = await this.prisma.studentProfile.findUnique({ where: { id: student.id } });
             const targetGroup = await this.prisma.academicGroup.findUnique({ where: { id: assignment.groupId } });
             
             if (!studentFull || !targetGroup) {
                 throw new ForbiddenException('You do not have access to this subject material');
             }

             if (studentFull.classId !== targetGroup.classId || (targetGroup.sectionId && studentFull.sectionId !== targetGroup.sectionId)) {
                throw new ForbiddenException('You do not have access to this subject material');
             }
        }

        return this.prisma.syllabusFile.findMany({
            where: { schoolId, subjectAssignmentId: assignmentId },
            orderBy: { uploadedAt: 'desc' }
        });
    }
}
