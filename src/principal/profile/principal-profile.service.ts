import { Injectable, NotFoundException, BadRequestException, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdatePrincipalProfileDto } from './dto/update-principal-profile.dto';
import { ChangePasswordDto, UpdateEmailDto, UpdateUsernameDto, Toggle2FADto } from './dto/security.dto';
import * as argon2 from 'argon2';
import { AuthType, AuditAction } from '@prisma/client';

@Injectable()
export class PrincipalProfileService {
    private readonly logger = new Logger(PrincipalProfileService.name);
    constructor(private prisma: PrismaService) { }

    private async createAuditLog(schoolId: number, userId: number, action: AuditAction, entity: string, description?: string, oldValue?: any, newValue?: any) {
        try {
            await this.prisma.auditLog.create({
                data: {
                    schoolId,
                    userId,
                    action,
                    entity,
                    oldValue: oldValue ? JSON.parse(JSON.stringify(oldValue)) : undefined,
                    newValue: newValue ? JSON.parse(JSON.stringify(newValue)) : undefined,
                }
            });
        } catch (err) {
            this.logger.error(`Failed to create audit log: ${err.message}`);
        }
    }

    async getProfile(userId: number, schoolId: number) {
        this.logger.log(`Fetching profile for userId: ${userId}, schoolId: ${schoolId}`);
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                userSchools: {
                    where: { schoolId },
                    include: {
                        staffProfile: true, // Include staff profile
                        primaryRole: {
                            include: {
                                rolePermissions: {
                                    include: { permission: true }
                                }
                            }
                        },
                        school: {
                            select: { name: true, code: true, subdomain: true, createdAt: true }
                        }
                    }
                },
                authIdentities: {
                    select: { type: true, value: true }
                },
                departmentHeadOf: {
                    select: { name: true }
                },
                userPermissions: {
                    include: { permission: true }
                }
            }
        });

        if (!user) {
            this.logger.error(`User not found: ${userId}`);
            throw new NotFoundException('User not found');
        }

        const userSchool = user.userSchools[0];
        if (!userSchool) {
            this.logger.error(`User school mismatch. Request school: ${schoolId}`);
            throw new NotFoundException('User not found in this school');
        }

        // Merge permissions
        const rolePermissions = userSchool.primaryRole?.rolePermissions.map((rp: any) => rp.permission.name) || [];
        const directPermissions = user.userPermissions.map((up: any) => up.permission.name) || [];
        const allPermissions = [...new Set([...rolePermissions, ...directPermissions])];

        // Get active academic year for this school
        const activeYear = await this.prisma.academicYear.findFirst({
            where: { schoolId, status: 'ACTIVE' }
        });

        return {
            id: user.id,
            name: user.name,
            photo: user.photo,
            academicYearId: activeYear?.id || null,
            role: userSchool.primaryRole?.name || 'N/A',
            joinedAt: user.createdAt,
            lastSeen: user.lastSeen,
            school: {
                ...userSchool.school,
                establishedAt: userSchool.school.createdAt
            },
            departmentsHeaded: user.departmentHeadOf.map((d: any) => d.name),
            permissions: allPermissions,
            contact: [
                { type: 'EMAIL', value: userSchool.staffProfile?.email || user.authIdentities.find((id: any) => id.type === 'EMAIL')?.value },
                { type: 'PHONE', value: userSchool.staffProfile?.phone || user.authIdentities.find((id: any) => id.type === 'PHONE')?.value },
            ].filter(c => c.value),
            address: userSchool.staffProfile?.address,
            employment: userSchool.staffProfile ? {
                designation: userSchool.staffProfile.designation,
                department: userSchool.staffProfile.department,
                empCode: userSchool.staffProfile.empCode,
                joiningDate: userSchool.staffProfile.joiningDate,
                employmentType: userSchool.staffProfile.employmentType,
                qualifications: userSchool.staffProfile.qualifications,
                certifications: userSchool.staffProfile.certifications
            } : null
        };
    }

    async updateProfile(userId: number, schoolId: number, dto: UpdatePrincipalProfileDto) {
        const userSchool = await this.prisma.userSchool.findUnique({
            where: { userId_schoolId: { userId, schoolId } }
        });

        if (!userSchool) {
            throw new NotFoundException('User not found in this school');
        }

        // Handle staff profile update
        if (dto.employment || dto.contact) {
            await this.prisma.staffProfile.upsert({
                where: { userSchoolId: userSchool.id },
                create: {
                    userSchoolId: userSchool.id,
                    designation: dto.employment?.designation,
                    department: dto.employment?.department,
                    empCode: dto.employment?.empCode,
                    joiningDate: dto.employment?.joiningDate ? new Date(dto.employment.joiningDate) : undefined,
                    employmentType: dto.employment?.employmentType,
                    qualifications: dto.employment?.qualifications,
                    certifications: dto.employment?.certifications,
                    phone: dto.contact?.phone,
                    email: dto.contact?.email,
                    address: dto.contact?.address,
                },
                update: {
                    designation: dto.employment?.designation,
                    department: dto.employment?.department,
                    empCode: dto.employment?.empCode,
                    joiningDate: dto.employment?.joiningDate ? new Date(dto.employment.joiningDate) : undefined,
                    employmentType: dto.employment?.employmentType,
                    qualifications: dto.employment?.qualifications,
                    certifications: dto.employment?.certifications,
                    phone: dto.contact?.phone,
                    email: dto.contact?.email,
                    address: dto.contact?.address,
                }
            });
        }

        if (dto.name || dto.photo) {
            await this.prisma.user.update({
                where: { id: userId },
                data: {
                    name: dto.name,
                    photo: dto.photo
                }
            });
        }

        await this.createAuditLog(schoolId, userId, AuditAction.UPDATE, 'Profile', 'Updated profile information', undefined, dto);
        return this.getProfile(userId, schoolId);
    }

    async getSecurityInfo(userId: number) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                authIdentities: true,
            },
        });

        if (!user) throw new NotFoundException('User not found');

        const emailIdentity = user.authIdentities.find(i => i.type === AuthType.EMAIL);
        const usernameIdentity = user.authIdentities.find(i => i.type === AuthType.USERNAME);

        return {
            email: emailIdentity?.value || '',
            username: usernameIdentity?.value || user.name.toLowerCase().replace(/\s+/g, '.'),
            twoFactorEnabled: user.twoFactorEnabled,
            passwordLastChanged: user.passwordLastChanged,
            lastLogin: user.lastSeen,
        };
    }

    async changePassword(userId: number, dto: ChangePasswordDto) {
        const identity = await this.prisma.authIdentity.findFirst({
            where: { userId, type: AuthType.EMAIL },
        });

        if (!identity || !identity.secret) {
            throw new BadRequestException('No password set for this account. Sign in with Google?');
        }

        // 1. Verify current password
        const isPasswordValid = await argon2.verify(identity.secret, dto.currentPassword);
        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid current password');
        }

        // 2. Hash new password
        const newHash = await argon2.hash(dto.newPassword);

        // 3. Update secret and invalidate other sessions
        await this.prisma.$transaction([
            this.prisma.authIdentity.update({
                where: { id: identity.id },
                data: { secret: newHash },
            }),
            this.prisma.user.update({
                where: { id: userId },
                data: {
                    tokenVersion: { increment: 1 },
                    passwordLastChanged: new Date()
                },
            }),
            // Delete all other tokens for this user
            this.prisma.authToken.deleteMany({
                where: { userId },
            })
        ]);

        // We don't have schoolId here easily, fetch from UserSchool
        const userSchool = await this.prisma.userSchool.findFirst({ where: { userId } });
        if (userSchool) {
            await this.createAuditLog(userSchool.schoolId, userId, AuditAction.UPDATE, 'Security', 'Password changed');
        }

        return { message: 'Password updated successfully. Please log in again.' };
    }

    async updateEmail(userId: number, dto: UpdateEmailDto) {
        const normalized = dto.newEmail.toLowerCase().trim();
        const existing = await this.prisma.authIdentity.findFirst({
            where: { type: AuthType.EMAIL, value: normalized },
        });

        if (existing && existing.userId !== userId) {
            throw new BadRequestException('Email already in use by another account');
        }

        // Update existing EMAIL identity or create new one
        const currentEmailIdentity = await this.prisma.authIdentity.findFirst({
            where: { userId, type: AuthType.EMAIL }
        });

        if (currentEmailIdentity) {
            await this.prisma.authIdentity.update({
                where: { id: currentEmailIdentity.id },
                data: { value: normalized, verified: false }
            });
        } else {
            await this.prisma.authIdentity.create({
                data: {
                    userId,
                    type: AuthType.EMAIL,
                    value: normalized,
                    verified: false,
                },
            });
        }

        const userSchool = await this.prisma.userSchool.findFirst({ where: { userId } });
        if (userSchool) {
            await this.createAuditLog(userSchool.schoolId, userId, AuditAction.UPDATE, 'Security', `Email updated to ${normalized}`);
        }

        return { message: 'Email updated successfully' };
    }

    async toggle2FA(userId: number, dto: Toggle2FADto) {
        await this.prisma.user.update({
            where: { id: userId },
            data: { twoFactorEnabled: dto.enabled },
        });

        const userSchool = await this.prisma.userSchool.findFirst({ where: { userId } });
        if (userSchool) {
            await this.createAuditLog(userSchool.schoolId, userId, AuditAction.UPDATE, 'Security', `2FA ${dto.enabled ? 'enabled' : 'disabled'}`);
        }

        return { message: `Two-factor authentication ${dto.enabled ? 'enabled' : 'disabled'}` };
    }

    async updateUsername(userId: number, dto: UpdateUsernameDto) {
        const normalized = dto.newUsername.toLowerCase().trim();
        const existing = await this.prisma.authIdentity.findFirst({
            where: { type: AuthType.USERNAME, value: normalized },
        });

        if (existing && existing.userId !== userId) {
            throw new BadRequestException('Username already taken');
        }

        const currentUsernameIdentity = await this.prisma.authIdentity.findFirst({
            where: { userId, type: AuthType.USERNAME }
        });

        if (currentUsernameIdentity) {
            await this.prisma.authIdentity.update({
                where: { id: currentUsernameIdentity.id },
                data: { value: normalized }
            });
        } else {
            await this.prisma.authIdentity.create({
                data: {
                    userId,
                    type: AuthType.USERNAME,
                    value: normalized,
                    verified: true,
                },
            });
        }

        const userSchool = await this.prisma.userSchool.findFirst({ where: { userId } });
        if (userSchool) {
            await this.createAuditLog(userSchool.schoolId, userId, AuditAction.UPDATE, 'Security', `Username updated to ${normalized}`);
        }

        return { message: 'Username updated successfully' };
    }

    async getActivityLogs(userId: number) {
        const logs = await this.prisma.auditLog.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });

        return logs.map(log => ({
            id: log.id.toString(),
            action: this.formatAction(log.action, log.entity),
            description: this.formatDescription(log.action, log.entity, log.newValue),
            timestamp: log.createdAt.toISOString(),
            ipAddress: log.ipAddress || '127.0.0.1',
            device: 'System', // Prisma AuditLog doesn't store user agent currently
            type: this.mapType(log.action, log.entity),
        }));
    }

    private formatAction(action: AuditAction, entity: string) {
        if (action === AuditAction.LOGIN) return 'Successful Login';
        if (entity === 'Profile') return 'Profile Updated';
        if (entity === 'Security') return 'Security Update';
        return `${entity} ${action.toLowerCase()}`;
    }

    private formatDescription(action: AuditAction, entity: string, newValue: any) {
        if (action === AuditAction.LOGIN) return 'Logged in successfully';
        if (entity === 'Security' && newValue?.description) return newValue.description;
        if (entity === 'Profile') return 'Updated account information';
        return `Performed ${action} on ${entity}`;
    }

    private mapType(action: AuditAction, entity: string) {
        if (action === AuditAction.LOGIN) return 'login';
        if (entity === 'Profile') return 'profile_update';
        if (entity === 'Security') return 'security';
        return 'preference';
    }

    async getMemo(userId: number) {
        const memo = await this.prisma.principalMemo.findUnique({
            where: { userId },
        });
        return { content: memo?.content || '' };
    }

    async updateMemo(userId: number, content: string) {
        await this.prisma.principalMemo.upsert({
            where: { userId },
            update: { content },
            create: { userId, content },
        });
        return { message: 'Memo saved' };
    }
}
