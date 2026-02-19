import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { DEFAULT_MODULES } from '../common/constants/school-type.constants';

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
        type?: 'SCHOOL' | 'COLLEGE' | 'COACHING';
        academicYearName?: string;
        startDate?: string;
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
            // Cast type to any to avoid TS error before prisma generate
            const schoolType = (data.type || 'SCHOOL') as any; // SchoolType

            const school = await tx.school.create({
                data: {
                    name: data.name,
                    code: data.code,
                    subdomain: data.subdomain,
                    type: schoolType,
                    isActive: true,
                } as any,
            });

            // Get School Admin Role
            let adminRole = await tx.role.findUnique({
                where: { name: 'SCHOOL_ADMIN' },
            });

            // Fallback if role doesn't exist (bootstrapping issue)
            if (!adminRole) {
                // Log warning or handle?
            }

            // Create Admin User
            const user = await tx.user.create({
                data: {
                    schoolId: school.id,
                    name: data.adminName,
                    roleId: adminRole ? adminRole.id : 1, // Fallback
                },
            });

            // Assign Role explicitly
            if (adminRole) {
                await tx.userRole.create({
                    data: {
                        userId: user.id,
                        roleId: adminRole.id
                    }
                });
            }

            // Create Auth Identity (Email)
            const hashedPassword = await argon2.hash(data.initialPassword || 'password123');

            await tx.authIdentity.create({
                data: {
                    userId: user.id,
                    schoolId: school.id,
                    type: 'EMAIL',
                    value: data.adminEmail,
                    secret: hashedPassword,
                    verified: true,
                },
            });

            // --- CREATE ACADEMIC YEAR ---
            if (data.startDate && data.academicYearName) {
                const start = new Date(data.startDate);
                const end = new Date(start);
                end.setFullYear(end.getFullYear() + 1);
                end.setDate(end.getDate() - 1);

                await tx.academicYear.create({
                    data: {
                        schoolId: school.id,
                        name: data.academicYearName,
                        startDate: start,
                        endDate: end,
                        status: 'ACTIVE', // AcademicYearStatus.ACTIVE
                    },
                });
            }

            // --- ASSIGN DEFAULT MODULES ---
            const defaultModuleKeys = DEFAULT_MODULES[schoolType] || [];

            if (defaultModuleKeys.length > 0) {
                const modules = await tx.module.findMany({
                    where: { key: { in: defaultModuleKeys } }
                });

                if (modules.length > 0) {
                    await tx.schoolModule.createMany({
                        data: modules.map(m => ({
                            schoolId: school.id,
                            moduleId: m.id,
                            enabled: true
                        }))
                    });
                }
            }

            return school;
        });
    }

    async updateSchoolStatus(id: number, isActive: boolean) {
        return this.prisma.school.update({
            where: { id },
            data: { isActive },
        });
    }

    async updateSchool(id: number, data: {
        name?: string;
        code?: string;
        subdomain?: string;
        isActive?: boolean;
        type?: any; // SchoolType
    }) {
        return this.prisma.school.update({
            where: { id },
            data: {
                name: data.name,
                code: data.code,
                subdomain: data.subdomain,
                isActive: data.isActive,
                type: data.type,
            } as any,
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
