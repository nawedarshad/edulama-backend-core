import { Injectable, NotFoundException, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGrievanceDto } from './dto/create-grievance.dto';
import { UpdateGrievanceDto } from './dto/update-grievance.dto';
import { GrievanceFilterDto } from './dto/grievance-filter.dto';

@Injectable()
export class GrievanceService {
    private readonly logger = new Logger(GrievanceService.name);

    constructor(private readonly prisma: PrismaService) { }

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

        return this.prisma.grievance.create({
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
                raisedById
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

        return this.prisma.grievance.update({
            where: { id },
            data: {
                status: dto.status,
                resolutionNote: dto.resolutionNote,
                resolvedById: resolverId,
                resolvedAt: dto.status === 'RESOLVED' || dto.status === 'DISMISSED' ? new Date() : null
            }
        });
    }

    // 5. Delete
    async remove(schoolId: number, id: number) {
        const grievance = await this.prisma.grievance.findFirst({ where: { id, schoolId } });
        if (!grievance) throw new NotFoundException('Grievance not found');
        return this.prisma.grievance.delete({ where: { id } });
    }
}
