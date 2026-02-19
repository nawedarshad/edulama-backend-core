import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

import { CreateLessonDto, CreateQuizDto } from './dto/create-lesson.dto';
import { TeacherClassDiaryService } from './teacher-class-diary.service';
import { BadRequestException } from '@nestjs/common';

@Injectable()
export class LessonContentService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly classDiaryService: TeacherClassDiaryService
    ) { }

    // --- LESSONS ---

    async findAll(schoolId: number, academicYearId: number) {
        // 1. Fetch Auto-Scheduled Lesson Plans
        const plans = await this.prisma.lessonPlan.findMany({
            where: { schoolId, academicYearId },
            include: {
                subject: true,
                class: true,
                section: true
            },
            orderBy: { planDate: 'asc' }
        });

        // 2. Fetch Advanced Lessons
        const lessons = await this.prisma.lesson.findMany({
            where: { schoolId, academicYearId },
            include: {
                syllabus: {
                    include: {
                        subject: true,
                        class: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // 3. Normalize & Merge (Polymorphic Return)
        // We map them to a common shape that the frontend expects
        const mappedPlans = plans.map(p => ({
            id: p.id,
            type: 'PLAN',
            title: p.topicTitle, // Use topic as title for plans
            description: p.description,
            lessonDate: p.planDate,
            status: p.status,
            class: p.class,
            section: p.section,
            subject: p.subject,
            syllabus: {
                unit: p.unitTitle,
                chapter: p.chapterTitle,
                topic: p.topicTitle
            }
        }));

        const mappedLessons = lessons.map(l => ({
            id: l.id,
            type: 'LESSON',
            title: l.title,
            description: l.description,
            lessonDate: l.createdAt, // Lessons fallback to creation date if no specific date
            status: 'DRAFT', // Default for now
            class: l.syllabus.class,
            section: null, // Advanced lessons often linked to Class, not Section specific until assigned
            subject: l.syllabus.subject,
        }));

        return [...mappedPlans, ...mappedLessons];
    }

    async createLesson(schoolId: number, academicYearId: number, dto: CreateLessonDto) {
        return this.prisma.lesson.create({
            data: {
                schoolId,
                academicYearId,
                syllabusId: dto.syllabusId,
                title: dto.title,
                description: dto.description,
                content: dto.content ?? {},
                durationMinutes: dto.durationMinutes,
                thumbnail: dto.thumbnail,
            },
        });
    }

    async getLessonsBySyllabus(schoolId: number, academicYearId: number, syllabusId: number) {
        return this.prisma.lesson.findMany({
            where: { schoolId, academicYearId, syllabusId }
        });
    }

    // --- POLYMORPHIC RETRIEVAL ---

    async getLessonUnion(schoolId: number, academicYearId: number, id: number) {
        // 1. Try LessonPlan (most common from Dashboard list)
        const plan = await this.prisma.lessonPlan.findFirst({
            where: { id, schoolId, academicYearId },
            include: {
                class: true,
                section: true,
                subject: true,
            }
        });

        if (plan) {
            return {
                id: plan.id,
                type: 'PLAN',
                title: plan.topicTitle,
                description: plan.description,
                lessonDate: plan.planDate,
                status: plan.status,
                syllabus: {
                    unit: plan.unitTitle,
                    chapter: plan.chapterTitle,
                    topic: plan.topicTitle
                },
                // Flatten relations
                className: plan.class?.name,
                sectionName: plan.section?.name,
                subjectName: plan.subject?.name,
                // Original objects
                class: plan.class,
                section: plan.section,
                subject: plan.subject,
            };
        }

        // 2. Try Advanced Lesson
        const lesson = await this.prisma.lesson.findFirst({
            where: { id, schoolId, academicYearId }
        });

        if (lesson) {
            return {
                ...lesson,
                type: 'LESSON'
            };
        }

        throw new NotFoundException(`Lesson or Plan #${id} not found`);
    }

    // --- QUIZZES (REMOVED) ---
    // Quiz functionality has been removed from the lesson system

    // --- EXECUTION ---

    async completeLesson(schoolId: number, userId: number, academicYearId: number, lessonId: number, dto: any) {
        // 1. Find the Lesson Plan
        const plan = await this.prisma.lessonPlan.findFirst({
            where: { id: lessonId, schoolId, academicYearId },
            include: { subject: true }
        });

        if (!plan) {
            throw new NotFoundException(`Lesson Plan #${lessonId} not found.`);
        }

        // 2. Mark as Completed
        const updatedPlan = await this.prisma.lessonPlan.update({
            where: { id: lessonId },
            data: { status: 'COMPLETED' }
        });

        // 3. Create Class Diary Entry
        // Ensure strictly one diary per lesson plan to avoid duplicates if clicked multiple times? 
        // Logic in Service handles "Same Day" check, but here we might be forcing a specific link.
        // For now, let generic service handle it or valid.

        try {
            await this.classDiaryService.create(schoolId, userId, academicYearId, {
                classId: plan.classId,
                sectionId: plan.sectionId,
                subjectId: plan.subjectId,
                lessonDate: new Date().toISOString(), // Completed NOW, or Plan Date? User likely wants TODAY.
                topic: plan.topicTitle,
                title: dto.title || `Completed: ${plan.topicTitle}`,
                description: dto.description || plan.description,
                homework: dto.homework,
                remarks: dto.remarks,
                objective: dto.objective,
                activity: dto.activity,
                media: [],
                studyMaterial: []
            });
        } catch (e) {
            console.warn("Class diary creation warning:", e.message);
            // We don't fail the whole request if diary fails (e.g. duplicate), but we should probably inform user.
            // For this specific 'Mark Complete' flow, maybe we SHOULD fail?
            // Let's assume duplication is handled safely or we swallow if strictly duplicate.
        }

        return this.getLessonUnion(schoolId, academicYearId, lessonId);
    }
}
