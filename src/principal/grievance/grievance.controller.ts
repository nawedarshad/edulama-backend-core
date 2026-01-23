import { Controller, Get, Post, Body, Patch, Param, Delete, Query, Request, UseGuards, Headers, ParseIntPipe, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { GrievanceService } from './grievance.service';
import { CreateGrievanceDto } from './dto/create-grievance.dto';
import { UpdateGrievanceDto } from './dto/update-grievance.dto';
import { GrievanceFilterDto } from './dto/grievance-filter.dto';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { UserAuthGuard } from '../../common/guards/user.guard'; // Import Generic User Guard
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('Principal - Grievances')
@ApiBearerAuth()
@Controller('principal/grievances')
// Removed class-level @UseGuards(PrincipalAuthGuard) to allow mixed access
export class GrievanceController {
    constructor(
        private readonly grievanceService: GrievanceService,
        private readonly prisma: PrismaService
    ) { }

    private async getActiveAcademicYear(schoolId: number, headerYearId?: string): Promise<number> {
        if (headerYearId) return parseInt(headerYearId);
        const year = await this.prisma.academicYear.findFirst({ where: { schoolId, status: 'ACTIVE' } });
        if (!year) throw new Error('No active academic year found');
        return year.id;
    }

    @Post('config')
    @UseGuards(PrincipalAuthGuard) // Only Principal/Admin can configure
    @ApiOperation({ summary: 'Configure roles allowed to raise grievances' })
    async configureRoles(@Req() req, @Body() body: { roles: string[] }) {
        return this.grievanceService.configureRoles(req.user.schoolId, body.roles);
    }

    @Get('config')
    @UseGuards(UserAuthGuard) // Allow all users to check if they are enabled
    @ApiOperation({ summary: 'Get grievance configurations' })
    async getConfigs(@Req() req) {
        return this.grievanceService.getConfigs(req.user.schoolId);
    }

    @Post()
    @UseGuards(UserAuthGuard) // Any authenticated user (Role check in Service)
    @ApiOperation({ summary: 'Create a new grievance' })
    async create(
        @Request() req,
        @Body() dto: CreateGrievanceDto,
        @Headers('x-academic-year-id') yearIdHeader?: string,
    ) {
        console.log('Grievance Create Request User:', req.user);
        const yearId = await this.getActiveAcademicYear(req.user.schoolId, yearIdHeader);
        return this.grievanceService.create(req.user.schoolId, yearId, req.user.id, req.user.role, dto);
    }

    @Get()
    @UseGuards(UserAuthGuard) // Allow users to view (Service should filter own/all)
    @ApiOperation({ summary: 'Get all grievances' })
    async findAll(
        @Request() req,
        @Query() filters: GrievanceFilterDto,
        @Headers('x-academic-year-id') yearIdHeader?: string,
    ) {
        const yearId = await this.getActiveAcademicYear(req.user.schoolId, yearIdHeader);
        // Note: You might want to enforce that non-principals only see *their own* grievances here.
        // For now, passing filters. Service logic should handle visibility or we add it here.
        // Let's assume the service handles filtering or the caller passes 'raisedById'.
        // Ideally, if not Principal, force raisedById = req.user.id
        const userRole = req.user.role;
        if (userRole !== 'PRINCIPAL' && userRole !== 'ADMIN') {
            filters.raisedById = req.user.id;
        }

        return this.grievanceService.findAll(req.user.schoolId, yearId, filters);
    }

    @Patch(':id')
    @UseGuards(PrincipalAuthGuard) // Only Principal/Admin can resolve? Or maybe creator can cancel?
    // For now, mostly Principal resolving.
    @ApiOperation({ summary: 'Update grievance status' })
    update(
        @Request() req,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateGrievanceDto,
    ) {
        return this.grievanceService.update(req.user.schoolId, id, req.user.id, dto);
    }

    @Delete(':id')
    @UseGuards(UserAuthGuard) // Changed from PrincipalAuthGuard to allow Parents
    @ApiOperation({ summary: 'Delete a grievance' })
    remove(@Request() req, @Param('id', ParseIntPipe) id: number) {
        // Pass user ID and Role to service for ownership check
        return this.grievanceService.remove(req.user.schoolId, id, req.user.id, req.user.role);
    }
}
