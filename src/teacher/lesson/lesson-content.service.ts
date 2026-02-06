import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

import { CreateLessonDto, CreateQuizDto } from './dto/create-lesson.dto';

@Injectable()
export class LessonContentService {
    constructor(private readonly prisma: PrismaService) { }

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
            where: { schoolId, academicYearId, syllabusId },
            include: {
                quizzes: true,
                _count: { select: { progress: true } }
            }
        });
    }

    async getLessonDetails(schoolId: number, academicYearId: number, lessonId: number) {
        const lesson = await this.prisma.lesson.findFirst({
            where: { id: lessonId, schoolId, academicYearId },
            include: {
                quizzes: {
                    include: {
                        questions: {
                            include: { options: true }
                        }
                    }
                }
            }
        });

        if (!lesson) throw new NotFoundException('Lesson not found');
        return lesson;
    }

    // --- QUIZZES ---

    async addQuizToLesson(schoolId: number, academicYearId: number, lessonId: number, dto: CreateQuizDto) {
        // Verify lesson exists & ownership
        await this.getLessonDetails(schoolId, academicYearId, lessonId);

        return this.prisma.quiz.create({
            data: {
                lessonId,
                title: dto.title,
                description: dto.description,
                validUntil: dto.validUntil,
                questions: {
                    create: dto.questions.map((q, idx) => ({
                        text: q.text,
                        type: q.type,
                        points: q.points,
                        orderIndex: idx,
                        options: {
                            create: q.options.map(opt => ({
                                text: opt.text,
                                isCorrect: opt.isCorrect
                            }))
                        }
                    }))
                }
            },
            include: {
                questions: { include: { options: true } }
            }
        });
    }
}
