import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdatePrincipalProfileDto } from './dto/update-principal-profile.dto';

@Injectable()
export class PrincipalProfileService {
    private readonly logger = new Logger(PrincipalProfileService.name);
    constructor(private prisma: PrismaService) { }

    async getProfile(userId: number, schoolId: number) {
        this.logger.log(`Fetching profile for userId: ${userId}, schoolId: ${schoolId}`);
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                role: {
                    include: {
                        rolePermissions: {
                            include: { permission: true }
                        }
                    }
                },
                authIdentities: {
                    where: { schoolId },
                    select: { type: true, value: true }
                },
                school: {
                    select: { name: true, code: true, subdomain: true, createdAt: true }
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

        if (user.schoolId !== schoolId) {
            this.logger.error(`User school mismatch. User school: ${user.schoolId}, Request school: ${schoolId}`);
            throw new NotFoundException('User not found in this school');
        }

        // Merge permissions
        const rolePermissions = user.role?.rolePermissions.map(rp => rp.permission.name) || [];
        const directPermissions = user.userPermissions.map(up => up.permission.name) || [];
        const allPermissions = [...new Set([...rolePermissions, ...directPermissions])];

        return {
            id: user.id,
            name: user.name,
            photo: user.photo,
            role: user.role?.name || 'N/A',
            joinedAt: user.createdAt,
            lastSeen: user.lastSeen,
            school: {
                ...user.school,
                establishedAt: user.school.createdAt
            },
            departmentsHeaded: user.departmentHeadOf.map(d => d.name),
            permissions: allPermissions,
            contact: user.authIdentities.map(id => ({ type: id.type, value: id.value }))
        };
    }

    async updateProfile(userId: number, schoolId: number, dto: UpdatePrincipalProfileDto) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user || user.schoolId !== schoolId) {
            throw new NotFoundException('User not found');
        }

        return this.prisma.user.update({
            where: { id: userId },
            data: {
                name: dto.name,
                photo: dto.photo
            }
        });
    }
}
