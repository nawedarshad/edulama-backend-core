import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PrincipalDiaryQueryDto } from './dto/principal-diary-query.dto';
import { CreatePrincipalDiaryDto } from './dto/create-principal-diary.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class PrincipalDiaryService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll(schoolId: number, query: PrincipalDiaryQueryDto) {
        const {
            page = 1,
            limit = 10,
            teacherId,
            classId,
            sectionId,
            subjectId,
            academicYearId,
            date,
            startDate,
            endDate
        } = query;
        const skip = (page - 1) * limit;

        const where: Prisma.ClassDiaryWhereInput = {
            schoolId,
        };

        if (academicYearId) where.academicYearId = academicYearId;
        if (teacherId) where.teacherId = teacherId;
        if (classId) where.classId = classId;
        if (sectionId) where.sectionId = sectionId;
        if (subjectId) where.subjectId = subjectId;

        if (date) {
            where.lessonDate = new Date(date);
        } else if (startDate && endDate) {
            where.lessonDate = {
                gte: new Date(startDate),
                lte: new Date(endDate),
            };
        }

        const [data, total] = await Promise.all([
            this.prisma.classDiary.findMany({
                where,
                skip,
                take: limit,
                orderBy: { lessonDate: 'desc' },
                include: {
                    teacher: { select: { id: true, user: { select: { name: true } } } },
                    class: { select: { id: true, name: true } },
                    section: { select: { id: true, name: true } },
                    subject: { select: { id: true, name: true, code: true } },
                }
            }),
            this.prisma.classDiary.count({ where })
        ]);

        const mappedData = data.map(diary => ({
            ...diary,
            teacherName: diary.teacher?.user?.name || 'Unknown',
        }));

        return {
            data: mappedData,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    }

    async create(schoolId: number, academicYearId: number, dto: CreatePrincipalDiaryDto, userId: number) {
        // 1. Find the Class Subject configuration
        const classSubject = await this.prisma.classSubject.findFirst({
            where: {
                schoolId,
                academicYearId,
                classId: dto.classId,
                sectionId: dto.sectionId,
                subjectId: dto.subjectId,
            },
        });

        if (!classSubject) {
            throw new NotFoundException('Class Subject configuration not found for this selection.');
        }

        // 2. Ensure Principal has a Teacher Profile to be the author
        // User instruction: "assign principal profile if assigned by principal"
        // We use upsert to ensure a profile exists for this user.
        const principalTeacherProfile = await this.prisma.teacherProfile.upsert({
            where: { userId },
            update: {}, // No changes if exists
            create: {
                userId,
                schoolId,
                // Defaulting other required fields if any (schema allows defaults for most)
            },
        });

        // 3. Create the diary entry assigned to the Principal
        return this.prisma.classDiary.create({
            data: {
                schoolId,
                academicYearId,
                classId: dto.classId,
                sectionId: dto.sectionId,
                subjectId: dto.subjectId,
                teacherId: principalTeacherProfile.id, // Assigned to Principal
                classSubjectId: classSubject.id,
                title: dto.title,
                topic: dto.topic,
                description: dto.description,
                homework: dto.homework,
                lessonDate: new Date(dto.lessonDate),
                studyMaterial: dto.studyMaterial ? dto.studyMaterial : Prisma.JsonNull,
            },
        });
    }

    async remove(schoolId: number, id: number) {
        // Ensure it exists and belongs to school
        const diary = await this.prisma.classDiary.findFirst({
            where: { id, schoolId },
        });

        if (!diary) {
            throw new NotFoundException(`Class diary entry #${id} not found`);
        }

        return this.prisma.classDiary.delete({
            where: { id },
        });
    }

    async findOne(schoolId: number, id: number) {
        const diary = await this.prisma.classDiary.findFirst({
            where: { id, schoolId },
            include: {
                teacher: { select: { id: true, user: { select: { name: true } } } },
                class: { select: { id: true, name: true } },
                section: { select: { id: true, name: true } },
                subject: { select: { id: true, name: true, code: true } },
            },
        });

        if (!diary) {
            throw new NotFoundException(`Class diary entry #${id} not found`);
        }

        return {
            ...diary,
            teacherName: diary.teacher?.user?.name || 'Unknown',
        };
    }
}
