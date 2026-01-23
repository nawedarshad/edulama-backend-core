import { Injectable, BadRequestException, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSchoolAdminDto } from './dto/create-school-admin.dto';
import { UpdateSchoolAdminDto } from './dto/update-school-admin.dto';
import * as argon2 from 'argon2';

@Injectable()
export class SchoolAdminService {
    private readonly logger = new Logger(SchoolAdminService.name);

    constructor(private readonly prisma: PrismaService) { }

    async create(schoolId: number, dto: CreateSchoolAdminDto) {
        // 1. Check for duplicate email
        const existingIdentity = await this.prisma.authIdentity.findFirst({
            where: {
                schoolId,
                type: 'EMAIL',
                value: dto.email,
            },
        });

        if (existingIdentity) {
            throw new BadRequestException(`Email ${dto.email} is already in use`);
        }

        // 2. Find OR CREATE SCHOOL_ADMINISTRATOR Role
        let adminRole = await this.prisma.role.findFirst({
            where: { name: 'SCHOOL_ADMINISTRATOR' },
        });

        if (!adminRole) {
            this.logger.warn('System Role "SCHOOL_ADMINISTRATOR" not found. Auto-creating...');
            try {
                adminRole = await this.prisma.role.create({
                    data: { name: 'SCHOOL_ADMINISTRATOR' },
                });
            } catch (e) {
                this.logger.error("Failed to create SCHOOL_ADMINISTRATOR role.", e);
                throw new InternalServerErrorException('System Role "SCHOOL_ADMINISTRATOR" missing and could not be created.');
            }
        }

        // 3. Ensure Permissions Exist
        const permissionNames = dto.permissions || [];
        const permissionIds: number[] = [];

        if (permissionNames.length > 0) {
            for (const permName of permissionNames) {
                let perm = await this.prisma.permission.findUnique({ where: { name: permName } });
                if (!perm) {
                    try {
                        perm = await this.prisma.permission.create({ data: { name: permName } });
                    } catch (error) {
                        // Handle race condition
                        perm = await this.prisma.permission.findUnique({ where: { name: permName } });
                    }
                }
                if (perm) permissionIds.push(perm.id);
            }
        }

        const hashedPassword = await argon2.hash(dto.password || 'Admin@123');

        // 4. Transaction
        try {
            return await this.prisma.$transaction(async (tx) => {
                // A. Create User
                const user = await tx.user.create({
                    data: {
                        schoolId,
                        name: dto.name,
                        roleId: adminRole.id,
                        isActive: true,
                    },
                });

                // B. Create AuthIdentity
                await tx.authIdentity.create({
                    data: {
                        schoolId,
                        userId: user.id,
                        type: 'EMAIL',
                        value: dto.email,
                        secret: hashedPassword,
                        verified: true,
                    },
                });

                // C. Assign Permissions
                if (permissionIds.length > 0) {
                    await tx.userPermission.createMany({
                        data: permissionIds.map(pId => ({
                            userId: user.id,
                            permissionId: pId,
                        })),
                    });
                }

                // D. Create Scopes
                const scopes: any[] = [];
                if (dto.classIds && dto.classIds.length > 0) {
                    for (const cid of dto.classIds) {
                        scopes.push({ userId: user.id, classId: Number(cid) });
                    }
                }
                if (dto.sectionIds && dto.sectionIds.length > 0) {
                    for (const sid of dto.sectionIds) {
                        scopes.push({ userId: user.id, sectionId: Number(sid) });
                    }
                }

                if (scopes.length > 0) {
                    await tx.schoolAdminScope.createMany({
                        data: scopes,
                    });
                }

                return {
                    id: user.id,
                    name: user.name,
                    email: dto.email,
                    role: adminRole.name,
                    permissions: permissionNames,
                    scopesCount: scopes.length,
                    message: 'School Administrator created successfully',
                };
            });
        } catch (error) {
            this.logger.error('Error creating school admin', error);
            throw new InternalServerErrorException('Failed to create school admin');
        }
    }

    async findAll(schoolId: number) {
        // Find users with SCHOOL_ADMINISTRATOR role in this school
        const admins = await this.prisma.user.findMany({
            where: {
                schoolId,
                role: {
                    name: 'SCHOOL_ADMINISTRATOR'
                },
                isActive: true
            },
            select: {
                id: true,
                name: true,
                authIdentities: {
                    where: { type: 'EMAIL' },
                    select: { value: true }
                },
                userPermissions: {
                    include: {
                        permission: true
                    }
                },
                createdAt: true
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        // Flatten email, permissions, and scopes
        return admins.map(admin => ({
            ...admin,
            email: admin.authIdentities[0]?.value || '',
            permissions: admin.userPermissions.map(up => up.permission.name),
            authIdentities: undefined, // Remove nested
            userPermissions: undefined // Remove nested
        }));
    }

    async findOne(schoolId: number, id: number) {
        const admin = await this.prisma.user.findFirst({
            where: {
                id,
                schoolId,
                role: { name: 'SCHOOL_ADMINISTRATOR' }
            },
            include: {
                authIdentities: { where: { type: 'EMAIL' } },
                userPermissions: { include: { permission: true } },
                schoolAdminScopes: true
            }
        });

        if (!admin) throw new NotFoundException('School Administrator not found');

        return {
            ...admin,
            email: admin.authIdentities[0]?.value || '',
            permissions: admin.userPermissions.map(up => up.permission.name),
            classIds: admin.schoolAdminScopes.filter(s => s.classId).map(s => s.classId),
            sectionIds: admin.schoolAdminScopes.filter(s => s.sectionId).map(s => s.sectionId),
            authIdentities: undefined,
            userPermissions: undefined,
            schoolAdminScopes: undefined
        };
    }

    async update(schoolId: number, id: number, dto: UpdateSchoolAdminDto) {
        // Verify existence
        await this.findOne(schoolId, id);

        // Update logic (Transaction needed for scopes/permissions)
        // Simplified for MVP: Update basic info

        return this.prisma.$transaction(async (tx) => {
            if (dto.name) {
                await tx.user.updateMany({
                    where: { id, schoolId },
                    data: { name: dto.name }
                });
            }
            if (dto.permissions) {
                // Clear and re-add permissions
                // Get Permission IDs per name
                const permissionIds: number[] = [];
                for (const pName of dto.permissions) {
                    let p = await tx.permission.findUnique({ where: { name: pName } });
                    // Auto-create to be safe (should be seeded, but robust this way)
                    if (!p) {
                        try {
                            p = await tx.permission.create({ data: { name: pName } });
                        } catch (e) {
                            p = await tx.permission.findUnique({ where: { name: pName } });
                        }
                    }
                    if (p) permissionIds.push(p.id);
                }

                await tx.userPermission.deleteMany({ where: { userId: id } });
                if (permissionIds.length > 0) {
                    await tx.userPermission.createMany({
                        data: permissionIds.map(pid => ({ userId: id, permissionId: pid }))
                    });
                }
            }
            if (dto.classIds) {
                this.logger.log(`Updating classes for admin ${id}: ${JSON.stringify(dto.classIds)}`);
                // Remove existing class-only scopes
                const deleteResult = await tx.schoolAdminScope.deleteMany({
                    where: { userId: id, classId: { not: null } }
                });
                this.logger.log(`Deleted ${deleteResult.count} existing class scopes`);

                if (dto.classIds.length > 0) {
                    const createResult = await tx.schoolAdminScope.createMany({
                        data: dto.classIds.map(cid => ({
                            userId: id,
                            classId: Number(cid)
                        }))
                    });
                    this.logger.log(`Created ${createResult.count} new class scopes`);
                }
            }

            if (dto.sectionIds) {
                this.logger.log(`Updating sections for admin ${id}: ${JSON.stringify(dto.sectionIds)}`);
                // Remove existing section scopes
                const deleteResult = await tx.schoolAdminScope.deleteMany({
                    where: { userId: id, sectionId: { not: null } }
                });
                this.logger.log(`Deleted ${deleteResult.count} existing section scopes`);

                if (dto.sectionIds.length > 0) {
                    const createResult = await tx.schoolAdminScope.createMany({
                        data: dto.sectionIds.map(sid => ({
                            userId: id,
                            sectionId: Number(sid)
                        }))
                    });
                    this.logger.log(`Created ${createResult.count} new section scopes`);
                }
            }

            return { message: "Updated successfully" };
        });
    }

    async remove(schoolId: number, id: number) {
        // Check if exists
        await this.findOne(schoolId, id);

        // Delete user (Cascade will handle relations)
        // Using deleteMany to enforce schoolId at db level as well
        const result = await this.prisma.user.deleteMany({
            where: { id, schoolId }
        });

        return result;
    }
}

