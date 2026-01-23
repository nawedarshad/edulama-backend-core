import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ParentClassDiaryService {
    constructor(private readonly prisma: PrismaService) { }

    private async validateAndGetStudentSection(schoolId: number, parentUserId: number, studentId: number) {
        // Verify Parent-Child Link and get Class/Section
        const studentProfile = await this.prisma.studentProfile.findFirst({
            where: {
                id: studentId,
                schoolId,
                parents: {
                    some: {
                        parent: {
                            userId: parentUserId
                        }
                    }
                }
            },
            select: {
                id: true,
                classId: true,
                sectionId: true
            }
        });

        if (!studentProfile) {
            throw new ForbiddenException('You can only view diaries for your own children.');
        }

        return studentProfile;
    }

    async getDailyDiaryLogs(schoolId: number, parentUserId: number, studentId: number, academicYearId: number, date: string) {
        const student = await this.validateAndGetStudentSection(schoolId, parentUserId, studentId);
        const targetDate = new Date(date);

        const logs = await this.prisma.classDiary.findMany({
            where: {
                schoolId,
                classId: student.classId,
                sectionId: student.sectionId,
                lessonDate: targetDate
            },
            include: {
                subject: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                        color: true
                    }
                },
                teacher: {
                    select: {
                        user: {
                            select: {
                                name: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                createdAt: 'desc' // Or potentially by period if linked, but createdAt/lessonDate is what we have
            }
        });

        return logs;
    }

    async getSubjectDiaryLogs(schoolId: number, parentUserId: number, studentId: number, subjectId: number, academicYearId: number, page: number = 1, limit: number = 20) {
        const student = await this.validateAndGetStudentSection(schoolId, parentUserId, studentId);
        const skip = (page - 1) * limit;

        const [logs, total] = await this.prisma.$transaction([
            this.prisma.classDiary.findMany({
                where: {
                    schoolId,
                    academicYearId,
                    classId: student.classId,
                    sectionId: student.sectionId,
                    subjectId: subjectId
                },
                select: {
                    id: true,
                    title: true,
                    topic: true,
                    lessonDate: true,
                    createdAt: true
                },
                orderBy: { lessonDate: 'desc' },
                skip,
                take: limit
            }),
            this.prisma.classDiary.count({
                where: {
                    schoolId,
                    academicYearId,
                    classId: student.classId,
                    sectionId: student.sectionId,
                    subjectId: subjectId
                }
            })
        ]);

        return {
            data: logs,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    }

    async getDiaryEntryDetails(schoolId: number, parentUserId: number, studentId: number, diaryId: number) {
        // 1. Verify specific student ownership first (security check)
        const student = await this.validateAndGetStudentSection(schoolId, parentUserId, studentId);

        // 2. Fetch Entry ensuring it belongs to student's class/section
        const entry = await this.prisma.classDiary.findFirst({
            where: {
                id: diaryId,
                schoolId,
                classId: student.classId,
                sectionId: student.sectionId
            },
            include: {
                subject: { select: { name: true, code: true } },
                teacher: { select: { user: { select: { name: true } } } }
            }
        });

        if (!entry) {
            throw new NotFoundException('Diary entry not found or belongs to a different class.');
        }

        return entry;
    }
}
