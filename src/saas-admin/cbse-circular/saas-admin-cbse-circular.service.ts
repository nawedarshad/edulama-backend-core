import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCbseCircularDto } from './dto/create-cbse-circular.dto';
import { UpdateCbseCircularDto } from './dto/update-cbse-circular.dto';
import { CbseCircularQueryDto } from './dto/cbse-circular-query.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class SaasAdminCbseCircularService {
    constructor(private prisma: PrismaService) { }

    async create(createDto: CreateCbseCircularDto) {
        const { attachments, ...data } = createDto;

        return this.prisma.cbseCircular.create({
            data: {
                ...data,
                attachments: {
                    create: attachments || [],
                },
            },
            include: {
                attachments: true,
            },
        });
    }

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

    async findOne(id: number) {
        const circular = await this.prisma.cbseCircular.findUnique({
            where: { id },
            include: { attachments: true },
        });

        if (!circular) {
            throw new NotFoundException(`CBSE Circular with ID ${id} not found`);
        }

        return circular;
    }

    async update(id: number, updateDto: UpdateCbseCircularDto) {
        await this.findOne(id); // Ensure exists

        const { attachments, ...data } = updateDto;

        // Transaction to update circular and replace attachments if provided
        return this.prisma.$transaction(async (tx) => {
            // 1. Update basic fields (only update if provided due to optional fields)
            const updated = await tx.cbseCircular.update({
                where: { id },
                data: data,
            });

            // 2. If attachments provided, replace them completely
            if (attachments !== undefined) {
                await tx.cbseCircularAttachment.deleteMany({
                    where: { cbseCircularId: id },
                });

                if (attachments.length > 0) {
                    await tx.cbseCircularAttachment.createMany({
                        data: attachments.map((att) => ({
                            ...att,
                            cbseCircularId: id,
                        })),
                    });
                }
            }

            return tx.cbseCircular.findUnique({
                where: { id },
                include: { attachments: true },
            });
        });
    }

    async remove(id: number) {
        await this.findOne(id); // Ensure exists
        return this.prisma.cbseCircular.delete({
            where: { id },
        });
    }

    async getAnalytics(id: number) {
        await this.findOne(id); // Ensure exists

        const [views, downloads, viewers] = await Promise.all([
            this.prisma.cbseCircularView.count({ where: { cbseCircularId: id } }),
            this.prisma.cbseCircularDownload.count({ where: { cbseCircularId: id } }),
            this.prisma.cbseCircularView.findMany({
                where: { cbseCircularId: id },
                select: { userRole: true },
            })
        ]);

        const roleBreakdown = viewers.reduce((acc, curr) => {
            const role = curr.userRole || 'UNKNOWN';
            acc[role] = (acc[role] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return {
            id,
            totalViews: views,
            totalDownloads: downloads,
            roleBreakdown
        };
    }
}
