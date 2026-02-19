import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LessonAnalyticsService {
    constructor(private readonly prisma: PrismaService) { }

    async getClassAnalytics(schoolId: number, academicYearId: number, classId: number, subjectId: number) {
        // Analytics models (StudentLessonProgress, StudentQuizAttempt) have been removed
        // Return placeholder data for now
        const totalStudents = await this.prisma.studentProfile.count({
            where: { schoolId, academicYearId, classId }
        });

        return {
            totalStudents,
            totalLessons: 0,
            avgCompletionRate: 0,
            avgWatchTimeSeconds: 0,
            avgQuizScore: 0,
            activeStudents: 0,
            message: 'Analytics tracking has been disabled'
        };
    }

    async getStudentAnalytics(schoolId: number, academicYearId: number, studentId: number) {
        // Analytics models have been removed
        // Return placeholder data
        return {
            summary: {
                completedLessons: 0,
                totalLearningTimeSeconds: 0,
            },
            recentActivity: [],
            recentQuizAttempts: [],
            message: 'Analytics tracking has been disabled'
        };
    }
}
