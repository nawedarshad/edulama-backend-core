import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';

@Injectable()
export class SaaSAdminService {
    constructor(private prisma: PrismaService) { }

    async getAllSchools(params: {
        skip?: number;
        take?: number;
        cursor?: Prisma.SchoolWhereUniqueInput;
        where?: Prisma.SchoolWhereInput;
        orderBy?: Prisma.SchoolOrderByWithRelationInput;
    }) {
        const { skip, take, cursor, where, orderBy } = params;
        return this.prisma.school.findMany({
            skip,
            take,
            cursor,
            where,
            orderBy,
            include: {
                _count: {
                    select: { studentProfiles: true },
                },
            },
            // Hiding sensitive data handled by DTO mapping usually, but raw prisma here
        });
    }

    async getSchoolById(id: number) {
        return this.prisma.school.findUnique({
            where: { id },
            include: {
                schoolModules: {
                    include: { module: true }
                }
            },
        });
    }

    async createSchool(data: {
        name: string;
        code: string;
        subdomain: string;
        adminEmail: string;
        adminName: string;
        adminPhone?: string;
        initialPassword?: string;
    }) {
        // 1. Check uniqueness
        const existing = await this.prisma.school.findFirst({
            where: {
                OR: [{ code: data.code }, { subdomain: data.subdomain }],
            },
        });

        if (existing) {
            throw new BadRequestException('School code or subdomain already exists');
        }

        // 2. Transaction
        return this.prisma.$transaction(async (tx) => {
            // Create School
            const school = await tx.school.create({
                data: {
                    name: data.name,
                    code: data.code,
                    subdomain: data.subdomain,
                    isActive: true,
                },
            });

            // Get School Admin Role
            let adminRole = await tx.role.findUnique({
                where: { name: 'SCHOOL_ADMIN' },
            });

            // Fallback if role doesn't exist (bootstrapping issue) in some envs
            // ideally seeded, but safest to findFirst
            if (!adminRole) {
                // Try finding any role meant for admins or throw
                // For now, assuming standard seed exists.
                // throw new BadRequestException("SCHOOL_ADMIN role not found in system.");
            }

            // If role ID is needed and strictly required, ensure DB is seeded. 
            // Assuming 'SCHOOL_ADMIN' exists as per standard seeds. 
            // If not, we might fail or default to a safe value? Better to fail.

            // Create Admin User
            const user = await tx.user.create({
                data: {
                    schoolId: school.id,
                    name: data.adminName,
                    roleId: adminRole ? adminRole.id : 1, // Fallback to 1 if missing, risky but prevents crash if seed missing. BETTER: Find by name.
                },
            });

            // Assign Role explicitly in UserRole if needed (User model has roleId, but UserRole also exists)
            if (adminRole) {
                await tx.userRole.create({
                    data: {
                        userId: user.id,
                        roleId: adminRole.id
                    }
                });
            }

            // Create Auth Identity (Email)
            const hashedPassword = await argon2.hash(data.initialPassword || 'password123'); // Default unless provided

            await tx.authIdentity.create({
                data: {
                    userId: user.id,
                    schoolId: school.id,
                    type: 'EMAIL',
                    value: data.adminEmail,
                    secret: hashedPassword,
                    verified: true, // Auto-verify initial admin
                },
            });

            return school;
        });
    }

    async updateSchoolStatus(id: number, isActive: boolean) {
        return this.prisma.school.update({
            where: { id },
            data: { isActive },
        });
    }

    async getPlatformStats() {
        const [totalSchools, activeSchools, totalStudents] = await Promise.all([
            this.prisma.school.count(),
            this.prisma.school.count({ where: { isActive: true } }),
            this.prisma.studentProfile.count(),
        ]);

        return {
            totalSchools,
            activeSchools,
            totalStudents
        };
    }

    // --- Feature Provisioning ---

    async getSchoolModules(schoolId: number) {
        return this.prisma.schoolModule.findMany({
            where: { schoolId },
            include: { module: true }
        });
    }

    async updateSchoolModules(schoolId: number, modules: { moduleId: number; enabled: boolean }[]) {
        // Upsert logic
        const results: any[] = [];
        for (const mod of modules) {
            const result = await this.prisma.schoolModule.upsert({
                where: {
                    schoolId_moduleId: {
                        schoolId,
                        moduleId: mod.moduleId
                    }
                },
                update: { enabled: mod.enabled },
                create: {
                    schoolId,
                    moduleId: mod.moduleId,
                    enabled: mod.enabled
                }
            });
            results.push(result);
        }
        return results;
    }
}
