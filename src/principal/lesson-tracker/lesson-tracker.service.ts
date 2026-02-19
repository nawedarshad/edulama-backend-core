import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface LessonTrackerItem {
    classId: number;
    className: string;
    sectionId: number;
    sectionName: string;
    subjectId: number;
    subjectName: string;
    subjectCode: string;
    teacherId: number | null;
    teacherName: string | null;
    totalLessons: number;
    completedLessons: number;
    plannedLessons: number;
    progressPercent: number;
    status: 'ON_TRACK' | 'DELAYED';
    delayCount: number;
    lastCompletedDate: Date | null;
}

@Injectable()
export class PrincipalLessonTrackerService {
    constructor(private readonly prisma: PrismaService) { }

    async getTrackerData(schoolId: number, academicYearId: number): Promise<LessonTrackerItem[]> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 1. Fetch all lesson plans for the academic year
        const lessonPlans = await this.prisma.lessonPlan.findMany({
            where: { schoolId, academicYearId },
            include: {
                class: { select: { id: true, name: true } },
                section: { select: { id: true, name: true } },
                subject: { select: { id: true, name: true, code: true } },
                teacher: {
                    select: {
                        id: true,
                        user: { select: { name: true } }
                    }
                }
            }
        }) as any; // Type assertion to bypass Prisma type inference issues

        // 2. Group by class-section-subject
        const grouped = new Map<string, {
            classId: number;
            className: string;
            sectionId: number;
            sectionName: string;
            subjectId: number;
            subjectName: string;
            subjectCode: string;
            teacherId: number | null;
            teacherName: string | null;
            plans: typeof lessonPlans;
        }>();

        for (const plan of lessonPlans) {
            const key = `${plan.classId}-${plan.sectionId}-${plan.subjectId}`;

            if (!grouped.has(key)) {
                grouped.set(key, {
                    classId: plan.classId,
                    className: plan.class?.name || 'Unknown',
                    sectionId: plan.sectionId,
                    sectionName: plan.section?.name || 'Unknown',
                    subjectId: plan.subjectId,
                    subjectName: plan.subject?.name || 'Unknown',
                    subjectCode: plan.subject?.code || '',
                    teacherId: plan.teacherId,
                    teacherName: plan.teacher?.user?.name || null,
                    plans: []
                });
            }

            grouped.get(key)!.plans.push(plan);
        }

        // 3. Calculate metrics for each group
        const results: LessonTrackerItem[] = [];

        for (const [key, data] of grouped.entries()) {
            const totalLessons = data.plans.length;
            const completedLessons = data.plans.filter(p => p.status === 'COMPLETED').length;
            const plannedLessons = data.plans.filter(p => p.status === 'PLANNED').length;

            // Count overdue lessons (planDate < today AND status != COMPLETED)
            const delayCount = data.plans.filter(p => {
                const planDate = new Date(p.planDate);
                planDate.setHours(0, 0, 0, 0);
                return planDate < today && p.status !== 'COMPLETED';
            }).length;

            // Find last completed date
            const completedPlans = data.plans
                .filter(p => p.status === 'COMPLETED')
                .sort((a, b) => new Date(b.planDate).getTime() - new Date(a.planDate).getTime());

            const lastCompletedDate = completedPlans.length > 0
                ? new Date(completedPlans[0].planDate)
                : null;

            const progressPercent = totalLessons > 0
                ? Math.round((completedLessons / totalLessons) * 100)
                : 0;

            const status = delayCount > 0 ? 'DELAYED' : 'ON_TRACK';

            results.push({
                classId: data.classId,
                className: data.className,
                sectionId: data.sectionId,
                sectionName: data.sectionName,
                subjectId: data.subjectId,
                subjectName: data.subjectName,
                subjectCode: data.subjectCode,
                teacherId: data.teacherId,
                teacherName: data.teacherName,
                totalLessons,
                completedLessons,
                plannedLessons,
                progressPercent,
                status,
                delayCount,
                lastCompletedDate
            });
        }

        // Sort by class, then section, then subject
        results.sort((a, b) => {
            if (a.className !== b.className) return a.className.localeCompare(b.className);
            if (a.sectionName !== b.sectionName) return a.sectionName.localeCompare(b.sectionName);
            return a.subjectName.localeCompare(b.subjectName);
        });

        return results;
    }

    async getSubjectDetail(
        schoolId: number,
        academicYearId: number,
        classId: number,
        sectionId: number,
        subjectId: number
    ) {
        const plans = await this.prisma.lessonPlan.findMany({
            where: { schoolId, academicYearId, classId, sectionId, subjectId },
            include: {
                teacher: { select: { user: { select: { name: true } } } }
            },
            orderBy: { planDate: 'asc' }
        }) as any;

        const totalLessons = plans.length;
        const completedLessons = plans.filter(p => p.status === 'COMPLETED').length;
        const progressPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

        return {
            plans,
            summary: {
                totalLessons,
                completedLessons,
                progressPercent,
            }
        };
    }
}
