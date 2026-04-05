import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserService {
    constructor(private readonly prisma: PrismaService) { }

    async updateDeviceToken(userId: number, token: string, appRole: string = 'DEFAULT') {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { deviceTokens: true } });
        const tokens = (user?.deviceTokens as Record<string, string>) || {};
        tokens[appRole] = token;

        return this.prisma.user.update({
            where: { id: userId },
            data: { deviceTokens: tokens },
        });
    }
}
