
import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { REQUIRED_MODULE_KEY } from '../decorators/required-module.decorator';

@Injectable()
export class ModuleGuard implements CanActivate {
    private readonly logger = new Logger(ModuleGuard.name);

    constructor(
        private reflector: Reflector,
        private prisma: PrismaService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const requiredModuleKey = this.reflector.getAllAndOverride<string>(REQUIRED_MODULE_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!requiredModuleKey) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user || !user.schoolId) {
            this.logger.warn('User or schoolId not found in request. ModuleGuard requires authentication.');
            return false; // Or true if we want to allow public access? For now fail safe.
        }

        // Check if the module is enabled for the school
        // We could optimize this by caching or fetching user with school modules
        // For now, let's query.

        const module = await this.prisma.module.findUnique({
            where: { key: requiredModuleKey },
        });

        if (!module) {
            this.logger.error(`Module key '${requiredModuleKey}' not found in database.`);
            throw new ForbiddenException(`System Invalid Configuration: Module '${requiredModuleKey}' does not exist.`);
        }

        const schoolModule = await this.prisma.schoolModule.findUnique({
            where: {
                schoolId_moduleId: {
                    schoolId: user.schoolId,
                    moduleId: module.id
                }
            },
        });

        if (!schoolModule || !schoolModule.enabled) {
            throw new ForbiddenException(`Module '${requiredModuleKey}' is not enabled for your school.`);
        }

        return true;
    }
}
