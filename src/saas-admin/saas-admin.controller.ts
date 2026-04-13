import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Query,
    ParseIntPipe,
    UseGuards,
    Delete
} from '@nestjs/common';
import { SaaSAdminService } from './saas-admin.service';
import { Prisma } from '@prisma/client';
import { ApiTags, ApiOperation, ApiQuery, ApiBody, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

// TODO: Add SuperAdmin Guard
@ApiTags('SaaS Admin')
@ApiBearerAuth()
@Controller('api/admin/schools')
export class SaaSAdminController {
    constructor(private readonly saasAdminService: SaaSAdminService) { }

    @Post()
    @ApiOperation({ summary: 'Create a new school (SaaS)', description: 'Registers a new school with an initial admin user and academic year. Used by SaaS administrators.' })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                name: { type: 'string', example: 'Example International School' },
                code: { type: 'string', example: 'EIS001' },
                subdomain: { type: 'string', example: 'eis' },
                adminEmail: { type: 'string', example: 'admin@eis.edu' },
                adminName: { type: 'string', example: 'School Admin' },
                initialPassword: { type: 'string' },
                type: { type: 'string', enum: ['SCHOOL', 'COLLEGE', 'COACHING'] },
                academicYearName: { type: 'string', example: '2025-26' },
                startDate: { type: 'string', format: 'date' }
            },
            required: ['name', 'code', 'subdomain', 'adminEmail', 'adminName']
        }
    })
    @ApiResponse({ status: 201, description: 'School and admin user created successfully.' })
    create(@Body() createSchoolDto: {
        name: string;
        code: string;
        subdomain: string;
        adminEmail: string;
        adminName: string;
        initialPassword?: string;
        type?: 'SCHOOL' | 'COLLEGE' | 'COACHING';
        academicYearName?: string;
        startDate?: string;
    }) {
        return this.saasAdminService.createSchool(createSchoolDto);
    }

    @Get()
    @ApiOperation({ summary: 'List all schools (SaaS)', description: 'Returns a paginated and searchable list of all schools on the platform.' })
    @ApiQuery({ name: 'skip', required: false, type: Number })
    @ApiQuery({ name: 'take', required: false, type: Number })
    @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by name, code, or subdomain' })
    @ApiQuery({ name: 'active', required: false, type: Boolean })
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
    @ApiOperation({ summary: 'Get platform stats', description: 'Returns high-level statistics about the entire platform (total schools, users, etc.).' })
    getStats() {
        // Note: This endpoint is technically under /api/admin/schools/stats if placed here, 
        // but "api/admin/stats" might be cleaner. 
        // For now, keeping it here as it relates to school stats, or moving to separate controller if needed.
        // Current path: GET /api/admin/schools/stats
        return this.saasAdminService.getPlatformStats();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get school by ID', description: 'Returns detailed information about a specific school.' })
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.saasAdminService.getSchoolById(id);
    }

    @Patch(':id/status')
    @ApiOperation({ summary: 'Update school active status', description: 'Enable or disable a school.' })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                isActive: { type: 'boolean' }
            },
            required: ['isActive']
        }
    })
    updateStatus(
        @Param('id', ParseIntPipe) id: number,
        @Body('isActive') isActive: boolean
    ) {
        return this.saasAdminService.updateSchoolStatus(id, isActive);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update school details', description: 'Updates core properties of a school.' })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                name: { type: 'string' },
                code: { type: 'string' },
                subdomain: { type: 'string' },
                isActive: { type: 'boolean' },
                type: { type: 'string', enum: ['SCHOOL', 'COLLEGE', 'COACHING'] }
            }
        }
    })
    update(
        @Param('id', ParseIntPipe) id: number,
        @Body() updateSchoolDto: {
            name?: string;
            code?: string;
            subdomain?: string;
            isActive?: boolean;
            type?: any; // SchoolType
        }
    ) {
        return this.saasAdminService.updateSchool(id, updateSchoolDto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete school', description: 'Permanently removes a school and all associated data. CAUTION: This is irreversible.' })
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.saasAdminService.deleteSchool(id);
    }

    @Get(':id/settings')
    @ApiOperation({ summary: 'Get school platform settings', description: 'Returns platform-level settings for a specific school (e.g. storage limits, features enabled).' })
    getSettings(@Param('id', ParseIntPipe) id: number) {
        return this.saasAdminService.getSchoolSettings(id);
    }

    @Patch(':id/settings')
    @ApiOperation({ summary: 'Update school platform settings', description: 'Updates platform-level settings for a school.' })
    @ApiBody({ type: Object, description: 'The settings object to merge' })
    updateSettings(
        @Param('id', ParseIntPipe) id: number,
        @Body() data: any
    ) {
        return this.saasAdminService.updateSchoolSettings(id, data);
    }
}
