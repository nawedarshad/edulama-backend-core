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

        // Resolve groupId if missing or 0
        let resolvedGroupId = dto.groupId;
        console.log(`[ClassDiary] Create attempt - Incoming groupId: ${dto.groupId}, sectionId: ${dto.sectionId}, classId: ${dto.classId}`);

        if (!resolvedGroupId || resolvedGroupId === 0) {
            if (dto.sectionId) {
                const group = await this.prisma.academicGroup.findFirst({
                    where: { schoolId, sectionId: dto.sectionId },
                    select: { id: true }
                });
                if (group) {
                    resolvedGroupId = group.id;
                    console.log(`[ClassDiary] Resolved groupId ${resolvedGroupId} from sectionId ${dto.sectionId}`);
                }
            } else if (dto.classId) {
                const group = await this.prisma.academicGroup.findFirst({
                    where: { schoolId, classId: dto.classId, sectionId: null },
                    select: { id: true }
                });
                if (group) {
                    resolvedGroupId = group.id;
                    console.log(`[ClassDiary] Resolved groupId ${resolvedGroupId} from classId ${dto.classId}`);
                }
            }
        }

        if (!resolvedGroupId || resolvedGroupId === 0) {
            console.error(`[ClassDiary] Failed to resolve groupId. Incoming:`, dto);
            throw new BadRequestException('A valid academic group ID is required for diary entry.');
        }

        console.log(`[ClassDiary] Final resolvedGroupId: ${resolvedGroupId}`);

        // Check for existing entry for this specific date
        const diaryDate = new Date(dto.lessonDate);
        const startOfDay = new Date(diaryDate); startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(diaryDate); endOfDay.setHours(23, 59, 59, 999);

        const existing = await this.prisma.classDiary.findFirst({
            where: {
                schoolId,
                teacherId,
                academicYearId: resolvedYearId,
                groupId: resolvedGroupId,
                subjectId: dto.subjectId,
                lessonDate: {
                    gte: startOfDay,
                    lte: endOfDay
                }
            }
        });

        if (existing) {
            throw new BadRequestException('A diary entry for this date already exists.');
        }

        return this.prisma.classDiary.create({
            data: {
                ...dto,
                groupId: resolvedGroupId,
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

        if (query.groupId) where.groupId = query.groupId;
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
                group: { select: { id: true, name: true } },
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
                group: { select: { id: true, name: true } },
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
