import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateLessonDto {
    syllabusId: number;
    title: string;
    description?: string;
    content?: any; // Rich JSON content
    durationMinutes?: number;
    thumbnail?: string;
}

export interface CreateQuizDto {
    title: string;
    description?: string;
    validUntil?: Date;
    questions: {
        text: string;
        type: string;
        points: number;
        options: {
            text: string;
            isCorrect: boolean;
        }[];
    }[];
}

@Injectable()
export class LessonContentService {
    constructor(private readonly prisma: PrismaService) { }

    // --- LESSONS ---

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
