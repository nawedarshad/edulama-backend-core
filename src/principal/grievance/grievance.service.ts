import { Injectable, NotFoundException, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGrievanceDto } from './dto/create-grievance.dto';
import { CreateBulkGrievanceDto } from './dto/create-bulk-grievance.dto';
import { UpdateGrievanceDto } from './dto/update-grievance.dto';
import { GrievanceFilterDto } from './dto/grievance-filter.dto';
import { NotificationService } from '../global/notification/notification.service';
import { NotificationType, GrievanceStatus } from '@prisma/client';

@Injectable()
export class GrievanceService {
    private readonly logger = new Logger(GrievanceService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly notificationService: NotificationService
    ) { }

    // ... existing methods ...



    // 1. Configure allowed roles (Admin/Principal only)
    async configureRoles(schoolId: number, roleNames: string[]) {
        this.logger.log(`Configuring grievance roles for school ${schoolId}: ${roleNames.join(', ')}`);

        // Disable all first? Or just upsert?
        // Let's iterate and enable/create

        const roles = await this.prisma.role.findMany({
            where: { name: { in: roleNames } }
        });

        if (roles.length !== roleNames.length) {
            throw new BadRequestException('Some roles not found');
        }

        // Transaction to update configs
        return this.prisma.$transaction(async (tx) => {
            // 1. Disable ALL roles for this school first (Reset state)
            await tx.grievanceConfig.updateMany({
                where: { schoolId },
                data: { isEnabled: false }
            });

            // 2. Enable ONLY the provided roles
            const results: any[] = [];
            for (const role of roles) {
                const config = await tx.grievanceConfig.upsert({
                    where: { schoolId_roleId: { schoolId, roleId: role.id } },
                    update: { isEnabled: true },
                    create: { schoolId, roleId: role.id, isEnabled: true }
                });
                results.push(config);
            }
            return results;
        });
    }

    async getConfigs(schoolId: number) {
        return this.prisma.grievanceConfig.findMany({
            where: { schoolId },
            include: { role: true }
        });
    }

    // 2. Create Bulk Grievances (Against multiple users)
    async createBulk(schoolId: number, academicYearId: number, userId: number, roleName: string, dto: CreateBulkGrievanceDto) {
        this.logger.log(`Bulk creating grievance by ${userId} against ${dto.againstUserIds.length} users`);

        const role = await this.prisma.role.findUnique({ where: { name: roleName } });
        if (!role) throw new BadRequestException(`Role ${roleName} not found`);

        if (role.name !== 'PRINCIPAL' && role.name !== 'ADMIN') {
            const config = await this.prisma.grievanceConfig.findUnique({
                where: { schoolId_roleId: { schoolId, roleId: role.id } }
            });
            if (!config || !config.isEnabled) throw new ForbiddenException(`Unauthorized`);
        }

        const grievances = await this.prisma.$transaction(async (tx) => {
            const results: any[] = [];
            for (const againstUserId of dto.againstUserIds) {
                const grievance = await tx.grievance.create({
                    data: {
                        schoolId,
                        academicYearId,
                        raisedById: userId,
                        title: dto.title,
                        description: dto.description,
                        category: dto.category as any,
                        priority: dto.priority as any || 'MEDIUM',
                        isAnonymous: dto.isAnonymous || false,
                        againstUserId: againstUserId,
                        attachments: dto.attachmentUrls ? {
                            create: dto.attachmentUrls.map(url => ({ fileUrl: url, uploadedById: userId }))
                        } : undefined
                    }
                });
                results.push(grievance);
            }
            return results;
        });

        return grievances;
    }

    // 2. Create Grievance
    async create(schoolId: number, academicYearId: number, userId: number, roleName: string, dto: CreateGrievanceDto) {
        this.logger.log(`Creating grievance for user ${userId} in school ${schoolId} with role ${roleName}`);

        const role = await this.prisma.role.findUnique({ where: { name: roleName } });
        if (!role) throw new BadRequestException(`Role ${roleName} not found`);

        if (role.name !== 'PRINCIPAL' && role.name !== 'ADMIN') {
            const config = await this.prisma.grievanceConfig.findUnique({
                where: { schoolId_roleId: { schoolId, roleId: role.id } }
            });

            if (!config || !config.isEnabled) {
                throw new ForbiddenException(`Role ${role.name} is not allowed to raise grievances.`);
            }
        }

        const grievance = await this.prisma.grievance.create({
            data: {
                schoolId,
                academicYearId,
                raisedById: userId,
                title: dto.title,
                description: dto.description,
                category: dto.category,
                priority: dto.priority || 'MEDIUM',
                isAnonymous: dto.isAnonymous || false,
                againstUserId: dto.againstUserId,
                attachments: dto.attachmentUrls ? {
                    create: dto.attachmentUrls.map(url => ({ fileUrl: url, uploadedById: userId }))
                } : undefined
            }
        });

        // Enterprise Routing Logic
        // 1. Notify Principals
        // 2. If Department Related, notify HOD? 
        // For now, notify all institutional admins
        const staffToNotify = await this.prisma.user.findMany({
            where: {
                schoolId,
                OR: [
                    { role: { name: 'PRINCIPAL' } },
                    { role: { name: 'ADMIN' } }
                ]
            },
            select: { id: true }
        });

        if (staffToNotify.length > 0) {
            await this.notificationService.create(schoolId, userId, {
                type: NotificationType.GRIEVANCE,
                title: `${dto.priority === 'URGENT' ? '🚨 URGENT: ' : ''}New Grievance`,
                message: `[${dto.category}] ${dto.title}`,
                targetUserIds: staffToNotify.map(s => s.id)
            });
        }

        return grievance;
    }

    // 3. Find All (with enhanced data)
    async findAll(schoolId: number, academicYearId: number, filters: GrievanceFilterDto) {
        const { status, raisedById, page = 1, limit = 10 } = filters;
        const skip = (page - 1) * limit;

        const data = await this.prisma.grievance.findMany({
            where: {
                schoolId,
                academicYearId,
                status,
                raisedById,
                category: filters.category as any,
                priority: filters.priority as any,
                ...(filters.role ? { raisedBy: { role: { name: filters.role } } } : {})
            },
            include: {
                raisedBy: {
                    select: {
                        id: true,
                        name: true,
                        photo: true,
                        role: { select: { name: true } }
                    }
                },
                againstUser: { select: { id: true, name: true, photo: true } },
                assignedTo: { select: { id: true, name: true, photo: true } },
                attachments: true,
                _count: { select: { comments: true } }
            },
            orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
            skip,
            take: limit
        });

        // Mask identity if anonymous
        return data.map(g => {
            if (g.isAnonymous) {
                return {
                    ...g,
                    raisedBy: { id: 0, name: 'Anonymous User', photo: null, role: { name: 'GHOST' } }
                };
            }
            return g;
        });
    }

    async findOne(schoolId: number, id: number) {
        const grievance = await this.prisma.grievance.findFirst({
            where: { id, schoolId },
            include: {
                raisedBy: { select: { id: true, name: true, photo: true, role: { select: { name: true } } } },
                againstUser: { select: { id: true, name: true, photo: true } },
                assignedTo: { select: { id: true, name: true, photo: true } },
                attachments: true,
                comments: {
                    include: {
                        user: { select: { id: true, name: true, photo: true, role: { select: { name: true } } } }
                    },
                    orderBy: { createdAt: 'asc' }
                }
            }
        });

        if (!grievance) throw new NotFoundException('Grievance not found');

        if (grievance.isAnonymous) {
            grievance.raisedBy = { id: 0, name: 'Anonymous User', photo: null, role: { name: 'GHOST' } } as any;
        }

        return grievance;
    }

    // 4. Update (Resolve/Dismiss/Assign)
    async update(schoolId: number, id: number, resolverId: number, dto: UpdateGrievanceDto) {
        this.logger.log(`Updating grievance ${id} by ${resolverId}`);

        const grievance = await this.prisma.grievance.findFirst({
            where: { id, schoolId }
        });

        if (!grievance) throw new NotFoundException(`Grievance ${id} not found`);

        const updated = await this.prisma.grievance.update({
            where: { id },
            data: {
                status: dto.status,
                priority: dto.priority,
                assignedToId: dto.assignedToId,
                resolutionNote: dto.resolutionNote,
                resolvedById: (dto.status === 'RESOLVED' || dto.status === 'DISMISSED') ? resolverId : undefined,
                resolvedAt: (dto.status === 'RESOLVED' || dto.status === 'DISMISSED') ? new Date() : undefined
            },
            include: { assignedTo: { select: { name: true } } }
        });

        // Notify Creator
        if (dto.status && dto.status !== grievance.status) {
            await this.notificationService.create(schoolId, resolverId, {
                type: NotificationType.GRIEVANCE,
                title: 'Action Taken',
                message: `Status of "${grievance.title}" set to ${dto.status}.`,
                targetUserIds: [grievance.raisedById]
            });
        }

        // Notify Assignee
        if (dto.assignedToId && dto.assignedToId !== grievance.assignedToId) {
            await this.notificationService.create(schoolId, resolverId, {
                type: NotificationType.GRIEVANCE,
                title: 'Duty Assigned',
                message: `You have been assigned to resolve: "${grievance.title}".`,
                targetUserIds: [dto.assignedToId]
            });
        }

        return updated;
    }

    async addComment(schoolId: number, id: number, userId: number, message: string) {
        const grievance = await this.prisma.grievance.findFirst({
            where: { id, schoolId }
        });
        if (!grievance) throw new NotFoundException('Grievance not found');

        const comment = await this.prisma.grievanceComment.create({
            data: {
                grievanceId: id,
                userId,
                message
            },
            include: {
                user: { select: { id: true, name: true, photo: true } }
            }
        });

        // Notify either the creator or the assignee
        const notifyIds: number[] = [];
        if (userId === grievance.raisedById) {
            // Reporter commented, notify handler
            if (grievance.assignedToId) notifyIds.push(grievance.assignedToId);
        } else {
            // Handler commented, notify reporter
            notifyIds.push(grievance.raisedById);
        }

        if (notifyIds.length > 0) {
            await this.notificationService.create(schoolId, userId, {
                type: NotificationType.GRIEVANCE,
                title: 'New Response',
                message: `Replied: "${message.substring(0, 30)}..."`,
                targetUserIds: notifyIds
            });
        }

        return comment;
    }

    async getSummary(schoolId: number, academicYearId: number) {
        const [total, open, closed, byCategory] = await Promise.all([
            this.prisma.grievance.count({ where: { schoolId, academicYearId } }),
            this.prisma.grievance.count({ where: { schoolId, academicYearId, status: 'OPEN' } }),
            this.prisma.grievance.count({ where: { schoolId, academicYearId, status: { in: ['RESOLVED', 'DISMISSED'] } } }),
            this.prisma.grievance.groupBy({
                by: ['category'],
                where: { schoolId, academicYearId },
                _count: true
            })
        ]);

        return {
            total,
            open,
            closed,
            byCategory: byCategory.map(c => ({ category: c.category, count: c._count }))
        };
    }

    async remove(schoolId: number, id: number, userId: number, userRole: string) {
        const grievance = await this.prisma.grievance.findFirst({ where: { id, schoolId } });
        if (!grievance) throw new NotFoundException('Grievance not found');

        const isAdminOrPrincipal = userRole === 'ADMIN' || userRole === 'PRINCIPAL';
        if (!isAdminOrPrincipal && grievance.raisedById !== userId) {
            throw new ForbiddenException('Unauthorized');
        }

        if (grievance.status !== 'OPEN' && !isAdminOrPrincipal) {
            throw new BadRequestException('Cannot delete processed ticket');
        }

        return this.prisma.grievance.delete({ where: { id } });
    }
}
