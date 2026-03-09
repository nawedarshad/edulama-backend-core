import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PublicSchoolService {
    constructor(private readonly prisma: PrismaService) { }

    async getSyllabusBySubdomain(subdomain: string) {
        // 1. Find school by subdomain
        const school = await this.prisma.school.findUnique({
            where: { subdomain },
            include: {
                schoolModules: {
                    include: { module: true }
                }
            }
        });

        if (!school) {
            throw new NotFoundException('School not found');
        }

        // Determine if they use HOMEWORK module or LESSON_PLANNING
        const usesHomeworkModule = school.schoolModules.some(
            sm => sm.enabled && sm.module.key === 'HOMEWORK'
        );

        // 2. Find active academic year
        const activeAcademicYear = await this.prisma.academicYear.findFirst({
            where: {
                schoolId: school.id,
                startDate: { lte: new Date() },
                endDate: { gte: new Date() },
            },
            orderBy: {
                startDate: 'desc'
            }
        });

        if (!activeAcademicYear) {
            return {
                schoolName: school.name,
                academicYear: null,
                classes: [],
                usesHomeworkModule
            };
        }

        // 3. Find all classes and their active subjects/assignments
        const classes: any[] = await this.prisma.class.findMany({
            where: { schoolId: school.id },
            include: {
                sections: {
                    include: {
                        SubjectAssignment: {
                            where: { academicYearId: activeAcademicYear.id },
                            include: {
                                subject: {
                                    include: {
                                        syllabi: {
                                            where: {
                                                academicYearId: activeAcademicYear.id,
                                                parentId: null // top level units
                                            },
                                            orderBy: { orderIndex: 'asc' },
                                            include: {
                                                children: {
                                                    orderBy: { orderIndex: 'asc' },
                                                    include: {
                                                        children: { orderBy: { orderIndex: 'asc' } }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                },
                                teacher: {
                                    include: { user: true }
                                },
                                // For HOMEWORK schools
                                syllabusFiles: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                name: 'asc' // You might want to sort numerically if classes are "1", "2", "3"
            }
        });

        // 4. Format the response data for the frontend
        const formattedClasses = classes.map(cls => ({
            id: cls.id,
            name: cls.name,
            sections: cls.sections.map(sec => ({
                id: sec.id,
                name: sec.name,
                subjects: sec.SubjectAssignment.map(assignment => ({
                    id: assignment.subject.id,
                    name: assignment.subject.name,
                    teacherName: assignment.teacher?.user?.name || 'Unassigned',
                    syllabusText: assignment.subject.syllabi.filter(u => (!u.classId || u.classId === cls.id)).map(unit => ({
                        id: unit.id,
                        title: unit.title,
                        chapters: unit.children.map(chapter => ({
                            id: chapter.id,
                            title: chapter.title,
                            topics: chapter.children.map(topic => ({
                                id: topic.id,
                                title: topic.title,
                                isCompleted: topic.isCompleted
                            }))
                        }))
                    })),
                    syllabusFiles: assignment.syllabusFiles.map(file => ({
                        id: file.id,
                        fileName: file.fileName,
                        fileUrl: file.fileUrl,
                        mimeType: file.mimeType,
                        fileSize: file.fileSize,
                        createdAt: file.createdAt
                    }))
                }))
            }))
        }));

        return {
            schoolName: school.name,
            academicYear: activeAcademicYear.name,
            usesHomeworkModule,
            classes: formattedClasses
        };
    }
}
