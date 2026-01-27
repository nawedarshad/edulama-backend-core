import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClassDiaryDto } from './dto/create-class-diary.dto';
import { UpdateClassDiaryDto } from './dto/update-class-diary.dto';
import { ClassDiaryQueryDto } from './dto/class-diary-query.dto';

@Injectable()
export class TeacherClassDiaryService {
    constructor(private readonly prisma: PrismaService) { }

    private async getTeacherIdFromUser(userId: number): Promise<number> {
        const teacher = await this.prisma.teacherProfile.findUnique({
            where: { userId },
        });

        if (!teacher) {
            throw new UnauthorizedException('Teacher profile not found for this user.');
        }
        return teacher.id;
    }

    private async resolveAcademicYearId(schoolId: number, academicYearId?: number): Promise<number> {
        if (academicYearId) return academicYearId;

        const activeYear = await this.prisma.academicYear.findFirst({
            where: { schoolId, status: 'ACTIVE' },
        });

        if (!activeYear) {
            const latestYear = await this.prisma.academicYear.findFirst({
                where: { schoolId },
                orderBy: { startDate: 'desc' },
            });

            if (!latestYear) {
                throw new NotFoundException('No academic year found for this school.');
            }
            return latestYear.id;
        }

        return activeYear.id;
    }

    async create(schoolId: number, userId: number, academicYearId: number | undefined, dto: CreateClassDiaryDto) {
        const teacherId = await this.getTeacherIdFromUser(userId);
        const resolvedYearId = await this.resolveAcademicYearId(schoolId, academicYearId);

        return this.prisma.classDiary.create({
            data: {
                ...dto,
                schoolId,
                academicYearId: resolvedYearId,
                teacherId,
                studyMaterial: dto.studyMaterial || [],
                objective: dto.objective,
                activity: dto.activity,
                remarks: dto.remarks,
                media: dto.media || [],
            },
        });
    }

    async findAll(schoolId: number, userId: number, academicYearId: number | undefined, query: ClassDiaryQueryDto) {
        const teacherId = await this.getTeacherIdFromUser(userId);
        const resolvedYearId = await this.resolveAcademicYearId(schoolId, academicYearId);

        const where: any = {
            schoolId,
            academicYearId: resolvedYearId,
            teacherId,
        };

        if (query.classId) where.classId = query.classId;
        if (query.subjectId) where.subjectId = query.subjectId;

        if (query.date) {
            const date = new Date(query.date);
            where.lessonDate = date;
        } else if (query.startDate && query.endDate) {
            where.lessonDate = {
                gte: new Date(query.startDate),
                lte: new Date(query.endDate),
            };
        }

        return this.prisma.classDiary.findMany({
            where,
            include: {
                class: { select: { id: true, name: true } },
                section: { select: { id: true, name: true } },
                subject: { select: { id: true, name: true, code: true } },
            },
            orderBy: { lessonDate: 'desc' },
        });
    }

    async findOne(schoolId: number, userId: number, id: number) {
        const teacherId = await this.getTeacherIdFromUser(userId);

        const diary = await this.prisma.classDiary.findFirst({
            where: { id, schoolId, teacherId },
            include: {
                class: { select: { id: true, name: true } },
                section: { select: { id: true, name: true } },
                subject: { select: { id: true, name: true, code: true } },
            },
        });

        if (!diary) {
            throw new NotFoundException(`Class diary entry #${id} not found`);
        }

        return diary;
    }

    async update(schoolId: number, userId: number, id: number, dto: UpdateClassDiaryDto) {
        const teacherId = await this.getTeacherIdFromUser(userId);

        // Verify ownership
        await this.findOne(schoolId, userId, id);

        return this.prisma.classDiary.update({
            where: { id },
            data: {
                ...dto,
                studyMaterial: dto.studyMaterial ?? undefined, // Only update if provided
                objective: dto.objective,
                activity: dto.activity,
                remarks: dto.remarks,
                media: dto.media,
            },
        });
    }

    async remove(schoolId: number, userId: number, id: number) {
        const teacherId = await this.getTeacherIdFromUser(userId);

        // Verify ownership
        await this.findOne(schoolId, userId, id);

        return this.prisma.classDiary.delete({
            where: { id },
        });
    }
}
