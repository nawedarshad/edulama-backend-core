import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserSearchQueryDto, ResetPasswordDto, ManageIdentityDto, UpdateUserStatusDto, UpdateProfileDto, EnterpriseBulkDto } from './dto/user-management.dto';
import * as argon2 from 'argon2';
import { AuthType } from '@prisma/client';

@Injectable()
export class UserManagementService {
    private readonly logger = new Logger(UserManagementService.name);

    constructor(private readonly prisma: PrismaService) { }

    async searchUsers(schoolId: number, query: UserSearchQueryDto) {
        const { search, role, page = 1, limit = 20 } = query;
        const skip = (page - 1) * limit;

        const where: any = {
            userSchools: { some: { schoolId } }
        };

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { authIdentities: { some: { value: { contains: search, mode: 'insensitive' } } } }
            ];
        }

        if (role) {
            where.userSchools.some.OR = [
                { primaryRole: { name: role.toUpperCase() } },
                { roles: { some: { role: { name: role.toUpperCase() } } } }
            ];
        }

        const [users, total] = await Promise.all([
            this.prisma.user.findMany({
                where,
                include: {
                    userSchools: {
                        where: { schoolId },
                        include: { primaryRole: true, roles: { include: { role: true } } }
                    },
                    authIdentities: true,
                    studentProfile: { select: { admissionNo: true, class: { select: { name: true } }, section: { select: { name: true } } } },
                    teacherProfile: { select: { empCode: true, department: true } },
                },
                skip,
                take: limit,
                orderBy: { name: 'asc' }
            }),
            this.prisma.user.count({ where })
        ]);

        return {
            users: users.map(u => {
                const membership = u.userSchools[0];
                const roles = [
                    membership?.primaryRole?.name,
                    ...membership?.roles.map(r => r.role.name)
                ].filter(Boolean);
                
                return {
                    id: u.id,
                    name: u.name,
                    isActive: u.isActive,
                    roles: Array.from(new Set(roles)),
                    identities: u.authIdentities.map(i => ({ type: i.type, value: i.value, verified: i.verified })),
                    profile: u.studentProfile || u.teacherProfile || null,
                    type: u.studentProfile ? 'STUDENT' : u.teacherProfile ? 'TEACHER' : 'OTHER'
                };
            }),
            total,
            page,
            limit
        };
    }

    async getUserDetails(schoolId: number, userId: number) {
        const user: any = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                userSchools: {
                    where: { schoolId },
                    include: { primaryRole: true, roles: { include: { role: true } } }
                },
                authIdentities: true,
                studentProfile: { include: { class: true, section: true } },
                teacherProfile: true,
                parentProfile: { include: { parentStudents: { include: { student: true } } } }
            }
        });

        if (!user || user.userSchools.length === 0) {
            throw new NotFoundException('User not found in this school');
        }

        return user;
    }

    async resetPassword(schoolId: number, userId: number, dto: ResetPasswordDto) {
        // Verify user belongs to school
        await this.getUserDetails(schoolId, userId);

        const hashedPassword = await argon2.hash(dto.newPassword);

        // Update all identities with secret
        await this.prisma.$transaction([
            this.prisma.authIdentity.updateMany({
                where: { userId },
                data: { secret: hashedPassword }
            }),
            this.prisma.user.update({
                where: { id: userId },
                data: { passwordChanged: true, passwordLastChanged: new Date() }
            })
        ]);

        return { message: 'Password reset successfully' };
    }

    async updateProfile(schoolId: number, userId: number, dto: UpdateProfileDto) {
        const user = await this.getUserDetails(schoolId, userId);
        
        const isStudent = !!user.studentProfile;
        
        return await this.prisma.$transaction(async (tx) => {
            const updatedUser = await tx.user.update({
                where: { id: userId },
                data: { name: dto.name }
            });

            // If student, also update username
            if (isStudent && user.studentProfile?.admissionNo) {
                const school = await tx.school.findUnique({ where: { id: schoolId } });
                const newUsername = await this.generateUsername(dto.name, user.studentProfile.admissionNo);
                await tx.authIdentity.updateMany({
                    where: { userId, type: AuthType.USERNAME },
                    data: { value: newUsername }
                });
            }

            return updatedUser;
        });
    }

    private async generateUsername(name: string, admissionNo: string): Promise<string> {
        const firstName = name.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
        return `${firstName}[${admissionNo.toLowerCase().trim()}]`;
    }

    async addIdentity(schoolId: number, userId: number, dto: ManageIdentityDto) {
        const user = await this.getUserDetails(schoolId, userId);

        if (user.studentProfile) {
            throw new BadRequestException('Student identities are managed automatically and cannot be changed manually');
        }

        // Rule: Only one auth identity at a time.
        // We will replace any existing identity of any type for non-students, 
        // OR simply enforce that they only have one at any given moment.
        
        const existingIdentities = await this.prisma.authIdentity.findMany({ where: { userId } });
        
        // Check uniqueness if value changes
        const conflict = await this.prisma.authIdentity.findFirst({
            where: { type: dto.type, value: dto.value, NOT: { userId } }
        });

        if (conflict) {
            throw new BadRequestException(`Identity ${dto.value} is already in use by another user`);
        }

        const data: any = {
            type: dto.type,
            value: dto.value,
            verified: dto.verified || false
        };

        if (dto.secret) {
            data.secret = await argon2.hash(dto.secret);
        }

        return await this.prisma.$transaction(async (tx) => {
            // Delete all existing identities (enforcing "only one")
            await tx.authIdentity.deleteMany({ where: { userId } });
            
            return tx.authIdentity.create({
                data: {
                    ...data,
                    userId,
                    schoolId
                }
            });
        });
    }

    async removeIdentity(schoolId: number, userId: number, type: AuthType, value: string) {
        const user = await this.getUserDetails(schoolId, userId);

        if (user.studentProfile) {
            throw new BadRequestException('Student identities cannot be removed manually');
        }

        const identities = await this.prisma.authIdentity.findMany({ where: { userId } });
        if (identities.length <= 1) {
            throw new BadRequestException('Cannot remove the last remaining identity');
        }

        const target = identities.find(i => i.type === type && i.value === value);
        if (!target) {
            throw new NotFoundException('Identity not found');
        }

        return this.prisma.authIdentity.delete({ where: { id: target.id } });
    }

    async updateStatus(schoolId: number, userId: number, dto: UpdateUserStatusDto) {
        await this.getUserDetails(schoolId, userId);

        return this.prisma.user.update({
            where: { id: userId },
            data: { isActive: dto.isActive }
        });
    }

    async bulkProvision(schoolId: number, dto: EnterpriseBulkDto) {
        this.logger.log(`Enterprise Bulk Provisioning for school ${schoolId}. Scope: ${dto.scope}`);
        
        const [studentRole, parentRole] = await Promise.all([
            this.prisma.role.findUnique({ where: { name: 'STUDENT' } }),
            this.prisma.role.findUnique({ where: { name: 'PARENT' } }),
        ]);

        if (!studentRole || !parentRole) throw new BadRequestException("Required roles not found");

        const school = await this.prisma.school.findUnique({ where: { id: schoolId } });
        if (!school) throw new BadRequestException("School not found");
        const schoolCode = school.code.toLowerCase();

        const results = { studentsProcessed: 0, parentsProcessed: 0, skipped: 0, errors: [] as string[] };

        const studentWhere: any = { schoolId, isActive: true };
        if (dto.classId) studentWhere.classId = dto.classId;
        if (dto.sectionId) studentWhere.sectionId = dto.sectionId;

        const students = await this.prisma.studentProfile.findMany({
            where: studentWhere,
            include: {
                user: { include: { authIdentities: true } },
                parents: { include: { parent: { include: { user: { include: { authIdentities: true } } } } } }
            }
        });

        for (const student of students) {
            try {
                if (dto.scope === 'ALL' || dto.scope === 'STUDENTS') {
                    await this.processStudentBulk(student, schoolCode, studentRole.id, dto, results);
                }
                if (dto.scope === 'ALL' || dto.scope === 'PARENTS') {
                    for (const ps of student.parents) {
                        await this.processParentBulk(ps.parent, parentRole.id, dto, results);
                    }
                }
            } catch (err: any) {
                results.errors.push(`${student.fullName}: ${err.message}`);
                results.skipped++;
            }
        }

        return {
            ...results,
            message: `Registry synchronized: ${results.studentsProcessed} students and ${results.parentsProcessed} parents updated.`
        };
    }

    private async processStudentBulk(student: any, schoolCode: string, roleId: number, dto: EnterpriseBulkDto, results: any) {
        const hasUser = !!student.userId;
        if (hasUser && !dto.resetExisting && !dto.syncUsernames) return;
        if (!hasUser && !dto.provisionMissing) return;

        if (!student.dob) {
            results.errors.push(`${student.fullName}: Skipped (Missing DOB)`);
            results.skipped++;
            return;
        }

        const dobDate = new Date(student.dob);
        const passwordRaw = [
            String(dobDate.getDate()).padStart(2, '0'),
            String(dobDate.getMonth() + 1).padStart(2, '0'),
            dobDate.getFullYear(),
        ].join('');
        const passwordHash = await argon2.hash(passwordRaw);

        const identityValue = await this.generateUsername(student.fullName, student.admissionNo);

        await this.prisma.$transaction(async (tx) => {
            let userId = student.userId;
            if (!userId) {
                const user = await tx.user.create({ data: { name: student.fullName, isActive: true } });
                userId = user.id;
                await tx.userSchool.create({ data: { userId, schoolId: student.schoolId, primaryRoleId: roleId, isActive: true } });
                await tx.studentProfile.update({ where: { id: student.id }, data: { userId } });
            }

            if (dto.syncUsernames || !hasUser) {
                await tx.authIdentity.upsert({
                    where: { userId } as any,
                    create: { userId, type: AuthType.USERNAME, value: identityValue, secret: passwordHash, verified: true, schoolId: student.schoolId },
                    update: { 
                        type: AuthType.USERNAME,
                        value: identityValue, 
                        schoolId: student.schoolId,
                        ...(dto.resetExisting && { secret: passwordHash }) 
                    }
                });
            } else if (dto.resetExisting) {
                await tx.authIdentity.updateMany({
                    where: { userId, type: AuthType.USERNAME },
                    data: { secret: passwordHash }
                });
            }
        });
        results.studentsProcessed++;
    }

    private async processParentBulk(parent: any, roleId: number, dto: EnterpriseBulkDto, results: any) {
        if (!parent.user || (parent.user.isActive && !dto.resetExisting)) return;

        await this.prisma.$transaction(async (tx) => {
            await tx.user.update({ where: { id: parent.userId }, data: { isActive: true } });
            await tx.authIdentity.updateMany({ where: { userId: parent.userId }, data: { verified: true } });
        });
        results.parentsProcessed++;
    }
}
