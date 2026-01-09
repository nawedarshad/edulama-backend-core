import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RoleService {
    private readonly logger = new Logger(RoleService.name);

    constructor(private readonly prisma: PrismaService) { }

    async findAll() {
        this.logger.log('Fetching all roles');
        // Exclude internal/system roles if necessary? Or just return all.
        // For now, return all roles.
        return this.prisma.role.findMany({
            orderBy: { name: 'asc' }
        });
    }
}
