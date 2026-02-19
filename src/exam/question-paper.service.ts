import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsEnum, IsJSON } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { QuestionType } from '@prisma/client';

// DTOs
export class CreateQuestionPaperDto {
    @IsNumber()
    @IsNotEmpty()
    scheduleId: number;

    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsOptional()
    instructions?: string;

    @IsString()
    @IsOptional()
    paperUrl?: string;

    @IsString()
    @IsOptional()
    solutionUrl?: string;

    @IsNumber()
    @IsOptional()
    totalQuestions?: number;

    @IsNumber()
    @IsOptional()
    totalMarks?: number;

    @IsNumber()
    @IsOptional()
    createdBy?: number;
}

export class CreateQuestionDto {
    @IsString()
    @IsNotEmpty()
    questionText: string;

    @IsEnum(QuestionType)
    @IsNotEmpty()
    questionType: QuestionType;

    @IsNumber()
    @IsNotEmpty()
    marks: number;

    @IsNumber()
    @IsOptional()
    order?: number;

    @IsOptional()
    options?: any; // JSON for MCQ options

    @IsString()
    @IsOptional()
    correctAnswer?: string;

    @IsString()
    @IsOptional()
    difficultyLevel?: string;

    @IsString()
    @IsOptional()
    bloomsLevel?: string;
}

export class UpdateQuestionPaperDto {
    @IsString()
    @IsOptional()
    title?: string;

    @IsString()
    @IsOptional()
    instructions?: string;

    @IsString()
    @IsOptional()
    paperUrl?: string;

    @IsString()
    @IsOptional()
    solutionUrl?: string;

    @IsNumber()
    @IsOptional()
    totalQuestions?: number;

    @IsNumber()
    @IsOptional()
    totalMarks?: number;
}

@Injectable()
export class QuestionPaperService {
    constructor(private readonly prisma: PrismaService) { }

    // ============================================================
    // QUESTION PAPER CRUD
    // ============================================================

    async create(schoolId: number, academicYearId: number, examId: number, dto: CreateQuestionPaperDto) {
        // Verify schedule exists
        const schedule = await this.prisma.examSchedule.findFirst({
            where: { id: dto.scheduleId, schoolId, academicYearId, examId },
        });

        if (!schedule) {
            throw new NotFoundException('Schedule not found');
        }

        // Check if paper already exists
        const existing = await this.prisma.questionPaper.findUnique({
            where: { scheduleId: dto.scheduleId },
        });

        if (existing) {
            throw new BadRequestException('Question paper already exists for this schedule');
        }

        return this.prisma.questionPaper.create({
            data: {
                schoolId,
                academicYearId,
                examId,
                ...dto,
            },
            include: {
                schedule: {
                    select: {
                        examDate: true,
                        subject: { select: { name: true, code: true } },
                        class: { select: { name: true } },
                    },
                },
            },
        });
    }

    async findBySchedule(schoolId: number, academicYearId: number, scheduleId: number) {
        return this.prisma.questionPaper.findUnique({
            where: { scheduleId },
            include: {
                questions: {
                    orderBy: { order: 'asc' },
                },
                schedule: {
                    select: {
                        examDate: true,
                        subject: { select: { name: true, code: true } },
                        class: { select: { name: true } },
                    },
                },
            },
        });
    }

    async findByExam(schoolId: number, academicYearId: number, examId: number) {
        return this.prisma.questionPaper.findMany({
            where: { schoolId, academicYearId, examId },
            include: {
                schedule: {
                    select: {
                        examDate: true,
                        subject: { select: { name: true, code: true } },
                        class: { select: { name: true } },
                    },
                },
                _count: {
                    select: { questions: true },
                },
            },
            orderBy: { schedule: { examDate: 'asc' } },
        });
    }

    async update(schoolId: number, academicYearId: number, id: number, dto: UpdateQuestionPaperDto) {
        const paper = await this.prisma.questionPaper.findFirst({
            where: { id, schoolId, academicYearId },
        });

        if (!paper) {
            throw new NotFoundException('Question paper not found');
        }

        return this.prisma.questionPaper.update({
            where: { id },
            data: dto,
        });
    }

    async delete(schoolId: number, academicYearId: number, id: number) {
        const paper = await this.prisma.questionPaper.findFirst({
            where: { id, schoolId, academicYearId },
        });

        if (!paper) {
            throw new NotFoundException('Question paper not found');
        }

        await this.prisma.questionPaper.delete({ where: { id } });
        return { message: 'Question paper deleted successfully' };
    }

    // ============================================================
    // QUESTIONS MANAGEMENT
    // ============================================================

    async addQuestion(schoolId: number, academicYearId: number, paperId: number, dto: CreateQuestionDto) {
        const paper = await this.prisma.questionPaper.findFirst({
            where: { id: paperId, schoolId, academicYearId },
        });

        if (!paper) {
            throw new NotFoundException('Question paper not found');
        }

        return this.prisma.question.create({
            data: {
                questionPaperId: paperId,
                ...dto,
            },
        });
    }

    async addQuestionsBulk(schoolId: number, academicYearId: number, paperId: number, questions: CreateQuestionDto[]) {
        const paper = await this.prisma.questionPaper.findFirst({
            where: { id: paperId, schoolId, academicYearId },
        });

        if (!paper) {
            throw new NotFoundException('Question paper not found');
        }

        const created = await this.prisma.$transaction(
            questions.map((q, index) =>
                this.prisma.question.create({
                    data: {
                        questionPaperId: paperId,
                        order: q.order || index + 1,
                        ...q,
                    },
                })
            )
        );

        // Update total questions and marks
        const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);
        await this.prisma.questionPaper.update({
            where: { id: paperId },
            data: {
                totalQuestions: questions.length,
                totalMarks,
            },
        });

        return { count: created.length, questions: created };
    }

    async updateQuestion(id: number, dto: Partial<CreateQuestionDto>) {
        return this.prisma.question.update({
            where: { id },
            data: dto,
        });
    }

    async deleteQuestion(id: number) {
        await this.prisma.question.delete({ where: { id } });
        return { message: 'Question deleted successfully' };
    }
}
