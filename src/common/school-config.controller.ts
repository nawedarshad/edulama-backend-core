
import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { UserAuthGuard } from './guards/user.guard';

@ApiTags('School Configuration')
@Controller('api/school-config')
@UseGuards(UserAuthGuard)
export class SchoolConfigController {
    constructor(private readonly prisma: PrismaService) { }

    @Get('modules')
    @ApiOperation({ summary: 'Get enabled modules for the school' })
    async getEnabledModules(@Request() req) {
        // If user is logged in, use their schoolId
        // If public endpoint is needed, we might need a different approach (e.g. by domain)
        // For now, assuming authenticated user or public with header/query?
        // Let's stick to authenticated for now as per plan "Public API" might imply public access?
        // But the plan says: "Create PublicSchoolModuleController ... generic user guard"
        // So we can use UserAuthGuard which allows any authenticated user.

        let schoolId = req?.user?.schoolId;

        // If not authenticated, try to resolve from header/domain? 
        // For now, let's enforce auth or make it public if needed.
        // UserAuthGuard throws if not authenticated.
        // If we want public access (e.g. login page), we need a different guard or no guard.
        // But the user constraint usually implies "Frontend shows what is allowed".
        // Frontend usually fetches this AFTER login.

        if (!schoolId) {
            // Fallback or error?
            // If we want to support pre-login, we need to lookup by subdomain
            // But let's assume post-login for now as per requirement "admin will decide... for tenant".
            return [];
        }

        const modules = await this.prisma.schoolModule.findMany({
            where: {
                schoolId: schoolId,
                enabled: true,
            },
            include: {
                module: true,
            },
        });

        return modules.map(m => ({
            key: m.module.key,
            name: m.module.name,
            description: m.module.description,
        }));
    }
}
