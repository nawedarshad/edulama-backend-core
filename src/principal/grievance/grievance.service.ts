import { Injectable, NotFoundException, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGrievanceDto } from './dto/create-grievance.dto';
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

    // 2. Create Grievance
    async create(schoolId: number, academicYearId: number, userId: number, roleName: string, dto: CreateGrievanceDto) {
        this.logger.log(`Creating grievance for user ${userId} in school ${schoolId} with role ${roleName}`);

        // Check if role is allowed
        // Principal and Admin are ALWAYS allowed or should be config? usually always allowed.
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
                againstUserId: dto.againstUserId,
                attachments: dto.attachmentUrls ? {
                    create: dto.attachmentUrls.map(url => ({ fileUrl: url }))
                } : undefined
            }
        });

        // Notify Principal(s)
        const principals = await this.prisma.user.findMany({
            where: {
                schoolId,
                role: { name: 'PRINCIPAL' }
            },
            select: { id: true }
        });

        if (principals.length > 0) {
            await this.notificationService.create(schoolId, userId, {
                type: NotificationType.GRIEVANCE,
                title: 'New Grievance Raised',
                message: `A new grievance "${dto.title}" has been raised.`,
                targetUserIds: principals.map(p => p.id)
            });
        }

        return grievance;
    }

    // 3. Find All
    async findAll(schoolId: number, academicYearId: number, filters: GrievanceFilterDto) {
        const { status, raisedById, page = 1, limit = 10 } = filters;
        const skip = (page - 1) * limit;

        return this.prisma.grievance.findMany({
            where: {
                schoolId,
                academicYearId,
                status,
                raisedById,
                ...(filters.role ? { raisedBy: { role: { name: filters.role } } } : {})
            },
            include: {
                raisedBy: {
                    select: {
                        id: true,
                        name: true,
                        role: { select: { name: true } },
                        parentProfile: {
                            select: {
                                parentStudents: {
                                    select: {
                                        student: {
                                            select: {
                                                fullName: true,
                                                admissionNo: true,
                                                rollNo: true,
                                                class: { select: { name: true } },
                                                section: { select: { name: true } }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                againstUser: { select: { id: true, name: true } },
                attachments: true
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit
        });
    }

    // 4. Update (Resolve/Dismiss)
    async update(schoolId: number, id: number, resolverId: number, dto: UpdateGrievanceDto) {
        this.logger.log(`Updating grievance ${id} by ${resolverId}`);

        const grievance = await this.prisma.grievance.findFirst({
            where: { id, schoolId }
        });

        if (!grievance) throw new NotFoundException(`Grievance ${id} not found`);

        const updatedGrievance = await this.prisma.grievance.update({
            where: { id },
            data: {
                status: dto.status,
                resolutionNote: dto.resolutionNote,
                resolvedById: resolverId,
                resolvedAt: dto.status === 'RESOLVED' || dto.status === 'DISMISSED' ? new Date() : null
            }
        });

        // Notify the user if status changed
        if (dto.status && dto.status !== grievance.status) {
            this.logger.log(`Grievance status changed from ${grievance.status} to ${dto.status}. Triggering notification for user ${grievance.raisedById}`);
            await this.notificationService.create(schoolId, resolverId, {
                type: NotificationType.GRIEVANCE,
                title: 'Grievance Update',
                message: `Your grievance "${grievance.title}" has been marked as ${dto.status}.`,
                targetUserIds: [grievance.raisedById]
            });
        } else {
            this.logger.log(`No status change detected (Old: ${grievance.status}, New: ${dto.status}). Notification skipped.`);
        }

        return updatedGrievance;
    }

    // 5. Delete
    // 5. Delete
    async remove(schoolId: number, id: number, userId: number, userRole: string) {
        const grievance = await this.prisma.grievance.findFirst({ where: { id, schoolId } });
        if (!grievance) throw new NotFoundException('Grievance not found');

        // Check Permissions
        const isAdminOrPrincipal = userRole === 'ADMIN' || userRole === 'PRINCIPAL';

        // If not Admin/Principal, they MUST be the creator
        if (!isAdminOrPrincipal && grievance.raisedById !== userId) {
            throw new ForbiddenException('You can only delete your own grievances.');
        }

        // Can only delete if status is OPEN
        if (grievance.status !== GrievanceStatus.OPEN) {
            throw new ForbiddenException('Cannot delete a grievance once action has been taken.');
        }

        return this.prisma.grievance.delete({ where: { id } });
    }
}
