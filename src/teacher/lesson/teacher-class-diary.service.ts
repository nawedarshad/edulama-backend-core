import { Injectable, NotFoundException, UnauthorizedException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { HomeworkStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClassDiaryDto } from './dto/create-class-diary.dto';
import { UpdateClassDiaryDto } from './dto/update-class-diary.dto';
import { ClassDiaryQueryDto } from './dto/class-diary-query.dto';
import { TeacherTimetableService } from '../timetable/teacher-timetable.service';

import { S3StorageService } from '../../common/file-upload/s3-storage.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class TeacherClassDiaryService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly teacherTimetableService: TeacherTimetableService,
        private readonly s3Service: S3StorageService,
    ) { }

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
        const startOfDay = new Date(diaryDate); startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(diaryDate); endOfDay.setUTCHours(23, 59, 59, 999);

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

        return this.prisma.$transaction(async (tx) => {
            const diary = await tx.classDiary.create({
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

            // Auto-create Homework if homework field is populated
            if (dto.homework && dto.homework.trim().length > 0) {
                let dueDate: Date;
                if (dto.homeworkDueDate) {
                    dueDate = new Date(dto.homeworkDueDate);
                    dueDate.setHours(23, 59, 59, 999);
                } else {
                    dueDate = await this.teacherTimetableService.getNextClassDate(
                        schoolId,
                        userId,
                        resolvedGroupId,
                        dto.subjectId,
                        dto.lessonDate
                    );
                    dueDate.setHours(23, 59, 59, 999);
                }

                const homework = await tx.homework.create({
                    data: {
                        schoolId,
                        academicYearId: resolvedYearId,
                        teacherId,
                        groupId: resolvedGroupId,
                        classId: dto.classId || null,
                        sectionId: dto.sectionId || null,
                        subjectId: dto.subjectId,
                        title: dto.title || `Homework: ${dto.topic || 'Untitled'}`,
                        description: dto.homework,
                        dueDate: dueDate,
                        taughtToday: dto.topic || dto.title,
                        attachments: [],
                    },
                });

                // Auto-create submission rows for all active students in the resolved group/section
                const students = await tx.studentProfile.findMany({
                    where: {
                        schoolId,
                        isActive: true,
                        OR: [
                            ...(dto.sectionId ? [{ sectionId: dto.sectionId }] : []),
                            { academicGroups: { some: { id: resolvedGroupId } } }
                        ]
                    },
                    select: { id: true },
                });

                if (students.length > 0) {
                    await tx.homeworkSubmission.createMany({
                        data: students.map((s) => ({
                            homeworkId: homework.id,
                            studentId: s.id,
                            schoolId,
                            status: HomeworkStatus.PENDING,
                        })),
                        skipDuplicates: true,
                    });
                }
            }

            return diary;
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
            const start = new Date(query.startDate);
            const end = new Date(query.endDate);
            const sDate = new Date(start); sDate.setUTCHours(0, 0, 0, 0);
            const eDate = new Date(end); eDate.setUTCHours(23, 59, 59, 999);
            where.lessonDate = {
                gte: sDate,
                lte: eDate,
            };
        }

        const diaries = await this.prisma.classDiary.findMany({
            where,
            include: {
                group: { select: { id: true, name: true } },
                class: { select: { id: true, name: true } },
                section: { select: { id: true, name: true } },
                subject: { select: { id: true, name: true, code: true } },
            },
            orderBy: { lessonDate: 'desc' },
        });

        // Fetch homework due dates for all diaries
        return Promise.all(diaries.map(async (diary) => {
            const tenSeconds = 10 * 1000;
            const startTime = new Date(diary.createdAt.getTime() - tenSeconds);
            const endTime = new Date(diary.createdAt.getTime() + tenSeconds);

            const homework = await this.prisma.homework.findFirst({
                where: {
                    schoolId,
                    teacherId,
                    subjectId: diary.subjectId,
                    groupId: diary.groupId,
                    createdAt: {
                        gte: startTime,
                        lte: endTime,
                    },
                },
                select: { dueDate: true }
            });

            return {
                ...diary,
                homeworkDueDate: homework?.dueDate || null
            };
        }));
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

        const tenSeconds = 10 * 1000;
        const startTime = new Date(diary.createdAt.getTime() - tenSeconds);
        const endTime = new Date(diary.createdAt.getTime() + tenSeconds);

        const homework = await this.prisma.homework.findFirst({
            where: {
                schoolId,
                teacherId,
                subjectId: diary.subjectId,
                groupId: diary.groupId,
                createdAt: {
                    gte: startTime,
                    lte: endTime,
                },
            },
            select: { dueDate: true }
        });

        return {
            ...diary,
            homeworkDueDate: homework?.dueDate || null
        };
    }

    async update(schoolId: number, userId: number, id: number, dto: UpdateClassDiaryDto) {
        const teacherId = await this.getTeacherIdFromUser(userId);

        // Verify ownership and get current state
        const diary = await this.findOne(schoolId, userId, id);

        // 1. Check 48-hour lock
        const now = new Date();
        const createdDate = new Date(diary.createdAt);
        const diffInHours = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60);
        if (diffInHours > 48) {
            throw new ForbiddenException('Class diary entry is locked (2 days passed since creation).');
        }

        // 2. Prepare update data and sanitize groupId
        const updateData: any = {
            ...dto,
            studyMaterial: dto.studyMaterial ?? undefined,
            objective: dto.objective,
            activity: dto.activity,
            remarks: dto.remarks,
            media: dto.media,
        };

        if (updateData.groupId === 0 || updateData.groupId === null) {
            delete updateData.groupId;
        }

        return this.prisma.$transaction(async (tx) => {
            const updatedDiary = await tx.classDiary.update({
                where: { id },
                data: updateData,
            });

            // 3. Sync Homework if changed
            if (dto.homework !== undefined) {
                // Find homework created around the same time as the diary (within 10s)
                const tenSeconds = 10 * 1000;
                const startTime = new Date(diary.createdAt.getTime() - tenSeconds);
                const endTime = new Date(diary.createdAt.getTime() + tenSeconds);

                const existingHomework = await tx.homework.findFirst({
                    where: {
                        schoolId,
                        teacherId,
                        subjectId: diary.subjectId,
                        groupId: diary.groupId,
                        createdAt: {
                            gte: startTime,
                            lte: endTime,
                        },
                    },
                });

                if (existingHomework) {
                    const hwUpdateData: any = {
                        description: dto.homework,
                        taughtToday: dto.topic || dto.title || existingHomework.taughtToday,
                    };

                    if (dto.homeworkDueDate) {
                        const dueDate = new Date(dto.homeworkDueDate);
                        dueDate.setHours(23, 59, 59, 999);
                        hwUpdateData.dueDate = dueDate;
                    }

                    await tx.homework.update({
                        where: { id: existingHomework.id },
                        data: hwUpdateData,
                    });
                }
            }

            return updatedDiary;
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

    async uploadMedia(schoolId: number, userId: number, file: any, title?: string) {
        const teacherId = await this.getTeacherIdFromUser(userId);

        // Extract file extension
        const originalNameParts = file.originalname.split('.');
        let ext = '';
        if (originalNameParts.length > 1) {
            ext = `.${originalNameParts.pop()}`;
        }

        // Use consistent path format: [tenantId]/[AcademicYear]/diary/[teacherId]/[filename]
        const tenantId = schoolId;
        const activeYear = await this.prisma.academicYear.findFirst({
            where: { schoolId, status: 'ACTIVE' },
        });
        const academicYear = activeYear ? activeYear.startDate.getFullYear() : new Date().getFullYear();
        
        const fileName = `${uuidv4()}${ext}`;
        const customKey = `${tenantId}/${academicYear}/diary/${teacherId}/${fileName}`;

        // Upload to S3
        const fileUrl = await this.s3Service.uploadFile(file.buffer, fileName, file.mimetype, customKey);

        return {
            title: title || file.originalname,
            url: fileUrl,
            mimeType: file.mimetype,
            size: file.size,
        };
    }
}
