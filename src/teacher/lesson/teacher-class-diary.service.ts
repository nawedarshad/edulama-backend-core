import { Injectable, NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
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

        // Check for existing entry for this specific date
        // Convert input date to start/end of day range or just check exact match if frontend sends uniform time
        // Better: Check for "Same Day"
        const diaryDate = new Date(dto.lessonDate);
        const startOfDay = new Date(diaryDate); startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(diaryDate); endOfDay.setHours(23, 59, 59, 999);

        const existing = await this.prisma.classDiary.findFirst({
            where: {
                schoolId,
                teacherId,
                academicYearId: resolvedYearId,
                classId: dto.classId,
                subjectId: dto.subjectId,
                lessonDate: {
                    gte: startOfDay,
                    lte: endOfDay
                }
            }
        });

        if (existing) {
            // Instead of error, we could return it or just block. 
            // User requirement says "one dairy per day".
            throw new BadRequestException('A diary entry for this date already exists.');
        }

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
            const startOfDay = new Date(date); startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date); endOfDay.setHours(23, 59, 59, 999);

            where.lessonDate = {
                gte: startOfDay,
                lte: endOfDay
            };
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
