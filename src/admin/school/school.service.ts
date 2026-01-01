
import { Injectable, Logger, BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
// We'll move the DTO as well, so updating import path in advance
import { CreateSchoolDto } from './dto/create-school.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';
import * as argon2 from 'argon2';
import { AcademicYearStatus } from '@prisma/client';

@Injectable()
export class SchoolService {
    private readonly logger = new Logger(SchoolService.name);

    constructor(private readonly prisma: PrismaService) { }

    async createSchool(dto: CreateSchoolDto) {
        // 1. Check for duplicates (School Code/Subdomain)
        const existingSchool = await this.prisma.school.findFirst({
            where: {
                OR: [
                    { code: dto.schoolCode },
                    { subdomain: dto.subdomain }
                ]
            }
        });

        if (existingSchool) {
            throw new BadRequestException('School code or subdomain already exists');
        }

        const {
            schoolName,
            schoolCode,
            subdomain,
            academicYearName,
            principalName,
            principalEmail,
            principalPassword,
            modules
        } = dto;

        // 2. Transactional Creation
        return await this.prisma.$transaction(async (tx) => {
            // A. Create School
            const school = await tx.school.create({
                data: {
                    name: schoolName,
                    code: schoolCode,
                    subdomain: subdomain,
                    isActive: true,
                }
            });

            this.logger.log(`Created School: ${school.name} (${school.id})`);


            // B. Create Academic Year
            const academicYear = await tx.academicYear.create({
                data: {
                    name: academicYearName,
                    schoolId: school.id,
                    startDate: new Date(), // Set default start/end for new school year
                    endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
                    status: AcademicYearStatus.ACTIVE
                }
            });

            // C. Create Principal User (Role ID 1)
            const principal = await tx.user.create({
                data: {
                    name: principalName,
                    schoolId: school.id,
                    roleId: 2, // PRINCIPAL
                    isActive: true,
                }
            });

            // D. Create Auth Identity
            const hashedPassword = await argon2.hash(principalPassword);
            await tx.authIdentity.create({
                data: {
                    userId: principal.id,
                    schoolId: school.id,
                    type: 'EMAIL',
                    value: principalEmail,
                    secret: hashedPassword,
                    verified: true
                }
            });

            // E. Assign Modules
            if (modules && modules.length > 0) {
                const moduleRecords = await tx.module.findMany({
                    where: {
                        key: { in: modules }
                    }
                });

                if (moduleRecords.length !== modules.length) {
                    this.logger.warn(`Some requested modules not found in DB. Requested: ${modules}, Found: ${moduleRecords.map(m => m.key)}`);
                }

                for (const mod of moduleRecords) {
                    await tx.schoolModule.create({
                        data: {
                            schoolId: school.id,
                            moduleId: mod.id,
                            enabled: true
                        }
                    });
                }
            }

            return {
                message: 'School created successfully',
                school: {
                    id: school.id,
                    name: school.name,
                    code: school.code
                },
                principal: {
                    id: principal.id,
                    email: principalEmail
                },
                academicYear: {
                    id: academicYear.id,
                    name: academicYear.name
                }
            };
        }).catch(error => {
            this.logger.error('Failed to create school', error);
            throw new InternalServerErrorException(error.message || 'Failed to create school');
        });
    }
    async getSchools() {
        const schools = await this.prisma.school.findMany({
            include: {
                _count: {
                    select: {
                        users: { where: { roleId: 2 } },
                        academicYears: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return schools.map((school) => ({
            ...school,
            principalCount: school._count.users,
            academicYearsCount: school._count.academicYears,
        }));
    }

    async findOne(id: number) {
        const school = await this.prisma.school.findUnique({
            where: { id },
            include: {
                schoolModules: {
                    where: { enabled: true },
                    include: {
                        module: true,
                    },
                },
                users: {
                    where: { roleId: 2 },
                    take: 1,
                    select: {
                        id: true,
                        name: true,
                        authIdentities: {
                            where: { type: 'EMAIL' },
                            select: { value: true },
                        },
                    },
                },
                _count: {
                    select: {
                        users: true,
                        academicYears: true,
                    },
                },
            },
        });

        if (!school) {
            throw new NotFoundException(`School with ID ${id} not found`);
        }

        const principal = school.users[0];
        const principalEmail = principal?.authIdentities[0]?.value;

        return {
            ...school,
            modules: school.schoolModules.map(sm => ({
                id: sm.module.id,
                key: sm.module.key,
                name: sm.module.key, // Using key as name since currently Module only has key
                isActive: sm.enabled,
            })),
            principal: principal ? {
                id: principal.id,
                name: principal.name,
                email: principalEmail,
            } : null,
            users: undefined, // Remove the raw users array from response
            schoolModules: undefined, // Remove the raw schoolModules array
        };
    }

    async update(id: number, updateSchoolDto: UpdateSchoolDto) {
        // Check if school exists
        await this.findOne(id);

        const { modules, ...data } = updateSchoolDto;

        // If modules are provided, we might need to handle them separately or ignore for now as per requirement complexity,
        // but typically updates updates basic info.
        // For now, let's update basic info.

        try {
            const updatedSchool = await this.prisma.school.update({
                where: { id },
                data: {
                    name: data.schoolName,
                    code: data.schoolCode,
                    subdomain: data.subdomain,
                    // We don't update principal info here usually, that's user management
                },
            });
            return updatedSchool;
        } catch (error) {
            if (error.code === 'P2002') {
                throw new BadRequestException('School code or subdomain already exists');
            }
            throw new InternalServerErrorException('Failed to update school');
        }
    }

    async remove(id: number) {
        await this.findOne(id);

        try {
            return await this.prisma.school.delete({
                where: { id },
            });
        } catch (error) {
            throw new InternalServerErrorException('Failed to delete school');
        }
    }
}
