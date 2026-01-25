import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserService {
    constructor(private readonly prisma: PrismaService) { }

    async updateDeviceToken(userId: number, token: string) {
        return this.prisma.user.update({
            where: { id: userId },
            data: { deviceToken: token },
        });
    }
}
