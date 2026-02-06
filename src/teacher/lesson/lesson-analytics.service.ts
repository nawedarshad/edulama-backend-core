import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LessonAnalyticsService {
    constructor(private readonly prisma: PrismaService) { }

    async getClassAnalytics(schoolId: number, academicYearId: number, classId: number, subjectId: number) {
        // 1. Get all students in the class
        const totalStudents = await this.prisma.studentProfile.count({
            where: { schoolId, academicYearId, classId }
        });

        // 2. Get all lessons for this subject (via syllabus topics associated with subject)
        // We need topics that are children of the subject? 
        // Actually syllabus has classId and subjectId.
        const lessons = await this.prisma.lesson.findMany({
            where: {
                schoolId,
                academicYearId,
                syllabus: {
                    classId,
                    subjectId
                }
            },
            select: { id: true }
        });
        const lessonIds = lessons.map(l => l.id);

        if (lessonIds.length === 0) return { completionRate: 0, avgScore: 0, engagement: 'Low' };

        // 3. Avg Completion Rate
        const progressStats = await this.prisma.studentLessonProgress.aggregate({
            where: {
                lessonId: { in: lessonIds },
                schoolId,
                academicYearId
            },
            _avg: {
                progressPercent: true,
                watchTimeSeconds: true
            },
            _count: {
                id: true // number of started lessons
            }
        });

        // 4. Quiz Scores
        const quizStats = await this.prisma.studentQuizAttempt.aggregate({
            where: {
                quiz: { lessonId: { in: lessonIds } },
                schoolId,
                academicYearId
            },
            _avg: {
                score: true
            }
        });

        return {
            totalStudents,
            totalLessons: lessons.length,
            avgCompletionRate: progressStats._avg.progressPercent || 0,
            avgWatchTimeSeconds: progressStats._avg.watchTimeSeconds || 0,
            avgQuizScore: quizStats._avg.score || 0,
            activeStudents: progressStats._count.id // Students who have at least started a lesson
        };
    }

    async getStudentAnalytics(schoolId: number, academicYearId: number, studentId: number) {
        // Get generic progress
        const progress = await this.prisma.studentLessonProgress.findMany({
            where: { schoolId, academicYearId, studentId },
            include: {
                lesson: {
                    select: { title: true, syllabus: { select: { title: true } } }
                }
            },
            orderBy: { lastAccessedAt: 'desc' }
        });

        // Get recent quiz attempts
        const attempts = await this.prisma.studentQuizAttempt.findMany({
            where: { schoolId, academicYearId, studentId },
            include: {
                quiz: { select: { title: true, lesson: { select: { title: true } } } }
            },
            orderBy: { attemptedAt: 'desc' },
            take: 5
        });

        // Calculate summary
        const completedLessons = progress.filter(p => p.status === 'COMPLETED').length;
        const totalTime = progress.reduce((acc, curr) => acc + (curr.watchTimeSeconds || 0), 0);

        return {
            summary: {
                completedLessons,
                totalLearningTimeSeconds: totalTime,
            },
            recentActivity: progress,
            recentQuizAttempts: attempts
        };
    }
}
