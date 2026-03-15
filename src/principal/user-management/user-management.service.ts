import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserSearchQueryDto, ResetPasswordDto, ManageIdentityDto, UpdateUserStatusDto } from './dto/user-management.dto';
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
                where: { userId, type: { in: ['EMAIL', 'USERNAME', 'PHONE'] } },
                data: { secret: hashedPassword }
            }),
            this.prisma.user.update({
                where: { id: userId },
                data: { passwordChanged: true, passwordLastChanged: new Date() }
            })
        ]);

        return { message: 'Password reset successfully' };
    }

    async addIdentity(schoolId: number, userId: number, dto: ManageIdentityDto) {
        await this.getUserDetails(schoolId, userId);

        // Check if global uniqueness
        const existing = await this.prisma.authIdentity.findUnique({
            where: { type_value: { type: dto.type, value: dto.value } }
        });

        if (existing) {
            throw new BadRequestException(`Identity ${dto.value} of type ${dto.type} already exists`);
        }

        const data: any = {
            userId,
            type: dto.type,
            value: dto.value,
            verified: dto.verified || false
        };

        if (dto.secret) {
            data.secret = await argon2.hash(dto.secret);
        }

        return this.prisma.authIdentity.create({ data });
    }

    async removeIdentity(schoolId: number, userId: number, type: AuthType, value: string) {
        await this.getUserDetails(schoolId, userId);

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
}
