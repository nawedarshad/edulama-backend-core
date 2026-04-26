import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { NotificationService } from '../global/notification/notification.service';
import { NotificationType } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import sanitizeHtml from 'sanitize-html';

import { AnnouncementQueryDto } from './dto/announcement-query.dto';
import { Prisma, AnnouncementPriority, AudienceType } from '@prisma/client';

@Injectable()
export class PrincipalAnnouncementService {
    private readonly logger = new Logger(PrincipalAnnouncementService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly notificationService: NotificationService,
        @InjectQueue('announcements') private readonly announcementQueue: Queue,
    ) { }

    async create(schoolId: number, userId: number, dto: CreateAnnouncementDto) {
        const { audiences, attachments, academicYearId, ...data } = dto;

        // Verify Academic Year belongs to school
        const academicYear = await this.prisma.academicYear.findFirst({
            where: { id: academicYearId, schoolId },
        });
        if (!academicYear) {
            throw new NotFoundException('Academic Year not found for this school');
        }

        // Robust Server-Side HTML Sanitization
        let safeBody = data.body;
        if (safeBody) {
            safeBody = sanitizeHtml(safeBody, {
                allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
                allowedAttributes: {
                    ...sanitizeHtml.defaults.allowedAttributes,
                    'img': ['src', 'alt', 'width', 'height'],
                },
                allowedSchemesByTag: {
                    img: ['http', 'https', 'data']
                }
            });
        }

        // Idempotency: Deduplicate emergency announcements within short window (1 minute)
        if (data.isEmergency) {
            const recent = await this.prisma.announcement.findFirst({
                where: {
                    schoolId,
                    createdById: userId,
                    title: data.title,
                    isEmergency: true,
                    createdAt: {
                        gte: new Date(Date.now() - 60000) // created in last 60 seconds
                    }
                }
            });
            if (recent) {
                return recent; // Silently return existing broadcast instead of failing or duplicating
            }
        }

        const result = await this.prisma.$transaction(async (tx) => {
            // 1. Create Announcement
            const announcement = await tx.announcement.create({
                data: {
                    ...data,
                    body: safeBody,
                    schoolId,
                    academicYearId,
                    createdById: userId,
                    priority: data.isEmergency ? AnnouncementPriority.CRITICAL : data.priority,
                    status: 'PUBLISHED', // Default to published for now, customizable later
                    publishedAt: new Date(),
                },
            });

            // 2. Create Audiences
            if (audiences && audiences.length > 0) {
                await tx.announcementAudience.createMany({
                    data: audiences.map((aud) => ({
                        ...aud,
                        schoolId,
                        announcementId: announcement.id,
                    })),
                });
            }

            // 3. Create Attachments
            if (attachments && attachments.length > 0) {
                await tx.announcementAttachment.createMany({
                    data: attachments.map((att) => ({
                        ...att,
                        schoolId,
                        announcementId: announcement.id,
                    })),
                });
            }

            return announcement;
        });

        const isEmergency = data.isEmergency || data.priority === AnnouncementPriority.CRITICAL;

        // Enqueue audience resolution and notification dispatch
        await this.announcementQueue.add('send-announcement', {
            schoolId,
            creatorId: userId,
            announcement: result,
            audiences,
        }, {
            priority: isEmergency ? 1 : 5, // 1 = highest priority in BullMQ
        });

        this.logger.log(`Announcement #${result.id} created and queued (school=${schoolId}, emergency=${isEmergency})`);

        return result;
    }



    async findAll(schoolId: number, query: AnnouncementQueryDto) {
        const { page = 1, limit = 10, search, type, startDate, endDate, academicYearId } = query;
        const skip = (page - 1) * limit;

        const where: Prisma.AnnouncementWhereInput = {
            schoolId,
            deletedAt: null,
        };

        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { body: { contains: search, mode: 'insensitive' } },
            ];
        }

        if (type) {
            where.type = type;
        }

        if (academicYearId) {
            where.academicYearId = academicYearId;
        }

        if (startDate || endDate) {
            where.createdAt = {
                ...(startDate ? { gte: new Date(startDate) } : {}),
                ...(endDate ? { lte: new Date(endDate) } : {})
            };
        }

        const [data, total] = await Promise.all([
            this.prisma.announcement.findMany({
                where,
                take: limit,
                skip,
                orderBy: { createdAt: 'desc' },
                include: {
                    audiences: true,
                    _count: {
                        select: {
                            acknowledgements: true
                        }
                    }
                }
            }),
            this.prisma.announcement.count({ where }),
        ]);

        return {
            data,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async getStats(schoolId: number, academicYearId?: number) {
        const where: Prisma.AnnouncementWhereInput = {
            schoolId,
            deletedAt: null,
            ...(academicYearId ? { academicYearId } : {}),
        };

        const [
            total,
            emergency,
            voice,
            byType,
            byStatus,
            byPriority
        ] = await Promise.all([
            // Total
            this.prisma.announcement.count({ where }),
            // Emergency
            this.prisma.announcement.count({ where: { ...where, isEmergency: true } }),
            // Voice
            this.prisma.announcement.count({ where: { ...where, voiceAudioUrl: { not: null } } }),
            // By Type
            this.prisma.announcement.groupBy({
                by: ['type'],
                where,
                _count: true,
            }),
            // By Status
            this.prisma.announcement.groupBy({
                by: ['status'],
                where,
                _count: true,
            }),
            // By Priority
            this.prisma.announcement.groupBy({
                by: ['priority'],
                where,
                _count: true,
            }),
        ]);

        // Helper to transform groupBy result to object
        const toMap = (data: any[], key: string) =>
            data.reduce((acc, curr) => ({ ...acc, [curr[key]]: curr._count }), {});

        return {
            total,
            emergency,
            voice,
            byType: toMap(byType, 'type'),
            byStatus: toMap(byStatus, 'status'),
            byPriority: toMap(byPriority, 'priority'),
        };
    }

    async findOne(schoolId: number, id: number) {
        const announcement = await this.prisma.announcement.findFirst({
            where: { id, schoolId, deletedAt: null },
            include: {
                audiences: true,
                attachments: true,
                createdBy: {
                    select: { id: true, name: true, photo: true },
                },
                _count: {
                    select: {
                        acknowledgements: true, // Total Acks
                    },
                },
            },
        });

        if (!announcement) {
            throw new NotFoundException(`Announcement #${id} not found`);
        }

        return announcement;
    }



    async update(schoolId: number, id: number, dto: Partial<CreateAnnouncementDto>) {
        const announcement = await this.prisma.announcement.findFirst({
            where: { id, schoolId, deletedAt: null },
        });
        if (!announcement) {
            throw new NotFoundException(`Announcement #${id} not found`);
        }

        let safeBody = dto.body;
        if (safeBody) {
            safeBody = sanitizeHtml(safeBody, {
                allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
                allowedAttributes: {
                    ...sanitizeHtml.defaults.allowedAttributes,
                    img: ['src', 'alt', 'width', 'height'],
                },
                allowedSchemesByTag: { img: ['http', 'https', 'data'] },
            });
        }

        return this.prisma.announcement.update({
            where: { id },
            data: {
                ...(dto.title && { title: dto.title }),
                ...(safeBody && { body: safeBody }),
                ...(dto.summary !== undefined && { summary: dto.summary }),
                ...(dto.type && { type: dto.type }),
                ...(dto.priority && { priority: dto.priority }),
            },
        });
    }

    async remove(schoolId: number, id: number) {
        const announcement = await this.prisma.announcement.findFirst({
            where: { id, schoolId, deletedAt: null }
        });

        if (!announcement) {
            throw new NotFoundException(`Announcement #${id} not found`);
        }

        // Soft delete
        return this.prisma.announcement.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
    }
}
