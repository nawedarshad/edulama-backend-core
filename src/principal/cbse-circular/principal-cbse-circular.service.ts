import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CbseCircularQueryDto } from '../../saas-admin/cbse-circular/dto/cbse-circular-query.dto';
import { Prisma, NoticeType, NoticePriority, AuditAction, NotificationType } from '@prisma/client';
import { NotificationService } from '../global/notification/notification.service';

@Injectable()
export class PrincipalCbseCircularService {
    constructor(
        private prisma: PrismaService,
        private readonly notificationService: NotificationService
    ) { }

    private async resolveTeacherProfile(schoolId: number, userId: number): Promise<number> {
        const profile = await this.prisma.teacherProfile.findUnique({
            where: { userId }
        });
        if (profile) return profile.id;

        const newProfile = await this.prisma.teacherProfile.create({
            data: {
                userId,
                schoolId,
                isActive: true,
                joinDate: new Date(),
                empCode: `BOARD-ADMIN-${userId}`,
            }
        });
        return newProfile.id;
    }

    async findAll(query: CbseCircularQueryDto) {
        const { type, search, page = 1, limit = 10 } = query;
        const skip = (page - 1) * limit;

        const where: Prisma.CbseCircularWhereInput = {};

        if (type) where.type = type;

        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { content: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [data, total] = await Promise.all([
            this.prisma.cbseCircular.findMany({
                where,
                skip: Number(skip),
                take: Number(limit),
                orderBy: { date: 'desc' },
                include: { attachments: true },
            }),
            this.prisma.cbseCircular.count({ where }),
        ]);

        return {
            data,
            meta: {
                total,
                page: Number(page),
                limit: Number(limit),
                totalPages: Math.ceil(total / Number(limit)),
            },
        };
    }

    async findOne(id: number, userId?: number, userRole?: string) {
        const circular = await this.prisma.cbseCircular.findUnique({
            where: { id },
            include: { attachments: true },
        });

        if (!circular) throw new NotFoundException(`CBSE Circular with ID ${id} not found`);

        if (userId && userRole) {
            try {
                await this.prisma.cbseCircularView.upsert({
                    where: { cbseCircularId_userId: { cbseCircularId: id, userId } },
                    update: { viewedAt: new Date() },
                    create: { cbseCircularId: id, userId, userRole }
                });
            } catch (e) {}
        }

        return circular;
    }

    async broadcast(schoolId: number, userId: number, id: number) {
        const circular = await this.findOne(id);
        const teacherId = await this.resolveTeacherProfile(schoolId, userId);

        const activeYear = await this.prisma.academicYear.findFirst({
            where: { schoolId, status: 'ACTIVE' }
        });
        if (!activeYear) throw new NotFoundException('Active Academic Year not found');

        // 1. Create a school notice
        const notice = await this.prisma.notice.create({
            data: {
                schoolId,
                academicYearId: activeYear.id,
                teacherId,
                title: `Official Board Circular: ${circular.title}`,
                content: circular.content,
                type: NoticeType.SCHOOL,
                priority: NoticePriority.NORMAL,
                attachments: {
                    create: circular.attachments.map(a => ({
                        fileName: a.fileName,
                        fileUrl: a.fileUrl,
                        fileType: a.fileType
                    }))
                }
            }
        });

        // 2. Audit Log
        await this.prisma.auditLog.create({
            data: {
                schoolId,
                userId,
                entity: 'CbseCircular',
                entityId: id,
                action: AuditAction.APPROVE, // Using APPROVE to signify "Push to School"
                newValue: { noticeId: notice.id }
            }
        });

        // 3. Dispatch Notifications
        try {
            await this.notificationService.create(schoolId, userId, {
                title: `New Board Update: ${circular.title}`,
                message: "A new official board circular has been published for your attention.",
                type: NotificationType.ANNOUNCEMENT,
                isGlobal: true,
                data: { noticeId: notice.id, module: 'Notice' }
            });
        } catch (e) {}

        return notice;
    }

    async recordDownload(id: number, attachmentId: number, userId: number, userRole: string) {
        try {
            await this.prisma.cbseCircularDownload.create({
                data: {
                    cbseCircularId: id,
                    attachmentId: attachmentId,
                    userId: userId,
                    userRole: userRole,
                }
            });
            return { success: true };
        } catch (error) {
            return { success: false };
        }
    }
}
