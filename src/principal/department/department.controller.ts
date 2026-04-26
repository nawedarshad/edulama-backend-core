import { Controller, Get, Post, Body, Req, UseGuards, Delete, Param, ParseIntPipe, Query, Patch, Res, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { DepartmentService } from './department.service';
import { CreateDepartmentDto, UpdateDepartmentDto, DepartmentQueryDto, AddDepartmentMemberDto, UpdateDepartmentMemberDto, AddDepartmentMembersBulkDto, AssignSubjectsBulkDto, DepartmentMemberQueryDto, DepartmentSubjectQueryDto } from './dto/department.dto';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { Audit } from '../../common/audit/audit.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ExportService } from '../../common/services/export.service';

import { RequiredModule } from '../../common/decorators/required-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';

@ApiTags('Department')
@Controller('principal/departments')
@UseGuards(PrincipalAuthGuard, ModuleGuard)
@RequiredModule('DEPARTMENTS')
@Audit('Department')
export class DepartmentController {
    private readonly logger = new Logger(DepartmentController.name);
    constructor(
        private readonly departmentService: DepartmentService,
        private readonly exportService: ExportService,
    ) { }

    @Post()
    @ApiOperation({ summary: 'Create a department' })
    @ApiResponse({ status: 201, description: 'The department has been successfully created.' })
    async create(@Req() req, @Body() dto: CreateDepartmentDto) {
        const schoolId = req.user.schoolId;
        return this.departmentService.create(schoolId, dto);
    }

    @Get()
    @ApiOperation({ summary: 'List all departments' })
    @ApiResponse({ status: 200, description: 'Return all departments with pagination.' })
    async findAll(
        @Req() req,
        @Query() query: DepartmentQueryDto,
    ) {
        const schoolId = req.user.schoolId;
        return this.departmentService.findAll(schoolId, query);
    }

    @Get('export')
    @ApiOperation({ summary: 'Export all departments to PDF' })
    @ApiResponse({ status: 200, description: 'Return PDF file stream.' })
    async export(@Req() req, @Res() res: Response) {
        const schoolId = req.user.schoolId;
        try {
            this.logger.debug(`Exporting minimalist departments report for school ${schoolId}`);
            
            // 1. Fetch all departments
            const departments = await this.departmentService.findAll(schoolId, { limit: 1000, page: 1 }) as any;
            
            // 2. Format data
            const headers = ['Code', 'Department Name', 'Type', 'Status', 'Head'];
            
            const rows = (departments.data as any[]).map(dept => [
                dept.code || '—',
                dept.name,
                dept.type?.replace('_', ' ') || '—',
                dept.status === 'ACTIVE' ? 'Active' : 'Inactive',
                dept.headUser?.name || '—'
            ]);

            // 3. Set headers for PDF download
            const date = new Date();
            const filename = `Departments_${date.toISOString().split('T')[0]}.pdf`;
            
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

            // 4. Generate Minimalistic PDF
            await this.exportService.generateMinimalPdfReport(
                schoolId,
                'Department Directory',
                headers,
                rows,
                res
            );
            
            this.logger.debug('Minimal PDF generated and delivered');
        } catch (error) {
            this.logger.error(`Export failed: ${error.message}`, error.stack);
            if (!res.headersSent) {
                res.status(500).json({ message: 'Export failed: ' + error.message });
            }
        }
    }

    @Get(':id/export')
    @ApiOperation({ summary: 'Export a specific department details to PDF' })
    @ApiResponse({ status: 200, description: 'Return detailed PDF file stream.' })
    async exportOne(@Req() req, @Res() res: Response, @Param('id', ParseIntPipe) id: number) {
        const schoolId = req.user.schoolId;
        try {
            this.logger.debug(`Exporting detailed report for department ${id}`);
            
            // Fetch department with all necessary relations for a full report
            const department = await this.departmentService.findOneFull(schoolId, id);
            
            const filename = `Department_${department.code}_Report.pdf`;
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

            await this.exportService.generateDetailedDepartmentReport(schoolId, department, res);
            
            this.logger.debug(`Detailed report for ${department.name} delivered`);
        } catch (error) {
            this.logger.error(`Individual export failed: ${error.message}`, error.stack);
            if (!res.headersSent) {
                res.status(500).json({ message: 'Detailed export failed: ' + error.message });
            }
        }
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a department by id' })
    @ApiResponse({ status: 200, description: 'Return the department.' })
    async findOne(@Req() req, @Param('id', ParseIntPipe) id: number) {
        const schoolId = req.user.schoolId;
        return this.departmentService.findOne(schoolId, id);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update a department' })
    @ApiResponse({ status: 200, description: 'The department has been successfully updated.' })
    async update(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateDepartmentDto,
    ) {
        const schoolId = req.user.schoolId;
        return this.departmentService.update(schoolId, id, dto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a department' })
    @ApiResponse({ status: 200, description: 'The department has been successfully deleted.' })
    async remove(@Req() req, @Param('id', ParseIntPipe) id: number) {
        const schoolId = req.user.schoolId;
        return this.departmentService.remove(schoolId, id);
    }

    // --- Member Endpoints ---

    @Post(':id/members')
    @ApiOperation({ summary: 'Add a member to a department' })
    @ApiResponse({ status: 201, description: 'Member added successfully.' })
    async addMember(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: AddDepartmentMemberDto
    ) {
        const schoolId = req.user.schoolId;
        return this.departmentService.addMember(schoolId, id, dto);
    }

    @Get(':id/members')
    @ApiOperation({ summary: 'List members of a department' })
    @ApiResponse({ status: 200, description: 'Return all members of the department.' })
    async getMembers(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Query() query: DepartmentMemberQueryDto,
    ) {
        const schoolId = req.user.schoolId;
        return this.departmentService.getMembers(schoolId, id, query);
    }

    @Get(':id/subjects')
    @ApiOperation({ summary: 'Get subjects assigned to a department' })
    @ApiResponse({ status: 200, description: 'Return list of subjects.' })
    async getSubjects(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Query() query: DepartmentSubjectQueryDto,
    ) {
        const schoolId = req.user.schoolId;
        return this.departmentService.getSubjects(schoolId, id, query);
    }

    @Patch(':id/members/:userId')
    @ApiOperation({ summary: 'Update a department member' })
    @ApiResponse({ status: 200, description: 'Member updated successfully.' })
    async updateMember(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Param('userId', ParseIntPipe) userId: number,
        @Body() dto: UpdateDepartmentMemberDto
    ) {
        const schoolId = req.user.schoolId;
        return this.departmentService.updateMember(schoolId, id, userId, dto);
    }

    @Delete(':id/members/:userId')
    @ApiOperation({ summary: 'Remove a member from a department' })
    @ApiResponse({ status: 200, description: 'Member removed successfully.' })
    async removeMember(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Param('userId', ParseIntPipe) userId: number,
    ) {
        const schoolId = req.user.schoolId;
        return this.departmentService.removeMember(schoolId, id, userId);
    }

    @Post(':id/members/bulk')
    @ApiOperation({ summary: 'Bulk add members to a department' })
    @ApiResponse({ status: 201, description: 'Members added successfully.' })
    async addMembersBulk(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: AddDepartmentMembersBulkDto
    ) {
        const schoolId = req.user.schoolId;
        return this.departmentService.addMembersBulk(schoolId, id, dto);
    }

    @Post(':id/subjects/bulk')
    @ApiOperation({ summary: 'Bulk assign subjects to a department' })
    @ApiResponse({ status: 201, description: 'Subjects assigned successfully.' })
    async assignSubjectsBulk(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: AssignSubjectsBulkDto
    ) {
        const schoolId = req.user.schoolId;
        return this.departmentService.assignSubjectsBulk(schoolId, id, dto);
    }
}
