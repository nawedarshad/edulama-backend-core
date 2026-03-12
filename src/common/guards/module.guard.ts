import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException, Logger } from '@nestjs/common';
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

        // No module required — pass through
        if (!requiredModuleKey) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user || !user.schoolId) {
            this.logger.warn('User or schoolId not found in request.');
            return false;
        }

        // ── 1. Permission version check ─────────────────────────────────────
        // NOTE: permissionVersion is currently not present on the School model in the database
        // so we disable this aggressive token invalidation logic for now to prevent Prisma TS errors.

        // ── 2. Module check from JWT (zero extra DB query) ──────────────────
        const modules: string[] = user.modules ?? [];

        // Special handling for Attendance vs Late modules if "Separate Late Module" is enabled
        if (requiredModuleKey === 'LATE_ATTENDANCE') {
            const schoolSettings = await this.prisma.schoolSettings.findUnique({
                where: { schoolId: user.schoolId },
                select: { trackingStrategy: true }
            });

            if (schoolSettings?.trackingStrategy !== 'ATTENDANCE_AND_LATE_SEPARATE') {
                this.logger.warn(`LATE_ATTENDANCE module requested but strategy is ${schoolSettings?.trackingStrategy}`);
                throw new ForbiddenException(`The Late Attendance module is not enabled for your school configuration.`);
            }
        }

        if (!modules.includes(requiredModuleKey)) {
            this.logger.warn(`Module '${requiredModuleKey}' not in JWT for school ${user.schoolId}`);
            throw new ForbiddenException(`Module '${requiredModuleKey}' is not enabled for your school.`);
        }

        return true;
    }
}
