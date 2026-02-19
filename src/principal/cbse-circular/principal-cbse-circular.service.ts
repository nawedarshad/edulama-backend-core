import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CbseCircularQueryDto } from '../../saas-admin/cbse-circular/dto/cbse-circular-query.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class PrincipalCbseCircularService {
    constructor(private prisma: PrismaService) { }

    async findAll(query: CbseCircularQueryDto) {
        const { type, search, page = 1, limit = 10 } = query;
        const skip = (page - 1) * limit;

        const where: Prisma.CbseCircularWhereInput = {};

        if (type) {
            where.type = type;
        }

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
        console.log(`[PrincipalCbseCircularService] Finding circular with ID: ${id}`);
        const circular = await this.prisma.cbseCircular.findUnique({
            where: { id },
            include: { attachments: true },
        });

        if (!circular) {
            console.error(`[PrincipalCbseCircularService] Circular ${id} NOT FOUND`);
            throw new NotFoundException(`CBSE Circular with ID ${id} not found`);
        }

        // Record View (Upsert to avoid duplicates or multiple simple inserts if we want unique views)
        // Schema says @@unique([cbseCircularId, userId]), so we can ignore if exists
        if (userId && userRole) {
            try {
                await this.prisma.cbseCircularView.upsert({
                    where: {
                        cbseCircularId_userId: {
                            cbseCircularId: id,
                            userId: userId,
                        }
                    },
                    update: {
                        viewedAt: new Date(), // Update timestamp if viewed again? Or keep first view? Let's update.
                    },
                    create: {
                        cbseCircularId: id,
                        userId: userId,
                        userRole: userRole,
                    }
                });
            } catch (error) {
                console.error("Failed to record circular view:", error);
                // Don't block the response if analytics fail
            }
        }

        return circular;
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
            console.error("Failed to record download:", error);
            // We can throw or just return false
            return { success: false };
        }
    }
}
