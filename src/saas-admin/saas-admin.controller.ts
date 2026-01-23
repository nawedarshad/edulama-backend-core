import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Query,
    ParseIntPipe,
    UseGuards
} from '@nestjs/common';
import { SaaSAdminService } from './saas-admin.service';
import { Prisma } from '@prisma/client';

// TODO: Add SuperAdmin Guard
@Controller('api/admin/schools')
export class SaaSAdminController {
    constructor(private readonly saasAdminService: SaaSAdminService) { }

    @Post()
    create(@Body() createSchoolDto: {
        name: string;
        code: string;
        subdomain: string;
        adminEmail: string;
        adminName: string;
        initialPassword?: string;
    }) {
        return this.saasAdminService.createSchool(createSchoolDto);
    }

    @Get()
    findAll(
        @Query('skip') skip?: string,
        @Query('take') take?: string,
        @Query('search') search?: string,
        @Query('active') active?: string
    ) {
        const where: Prisma.SchoolWhereInput = {};

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
                { subdomain: { contains: search, mode: 'insensitive' } }
            ];
        }

        if (active !== undefined) {
            where.isActive = active === 'true';
        }

        return this.saasAdminService.getAllSchools({
            skip: skip ? Number(skip) : undefined,
            take: take ? Number(take) : undefined,
            where,
            orderBy: { createdAt: 'desc' }
        });
    }

    @Get('stats')
    getStats() {
        // Note: This endpoint is technically under /api/admin/schools/stats if placed here, 
        // but "api/admin/stats" might be cleaner. 
        // For now, keeping it here as it relates to school stats, or moving to separate controller if needed.
        // Current path: GET /api/admin/schools/stats
        return this.saasAdminService.getPlatformStats();
    }

    @Get(':id')
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.saasAdminService.getSchoolById(id);
    }

    @Patch(':id/status')
    updateStatus(
        @Param('id', ParseIntPipe) id: number,
        @Body('isActive') isActive: boolean
    ) {
        return this.saasAdminService.updateSchoolStatus(id, isActive);
    }
}
