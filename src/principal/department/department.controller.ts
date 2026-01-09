import { Controller, Get, Post, Body, Req, UseGuards, Delete, Param, ParseIntPipe, Query, Patch } from '@nestjs/common';
import { DepartmentService } from './department.service';
import { CreateDepartmentDto, UpdateDepartmentDto, DepartmentQueryDto, AddDepartmentMemberDto, UpdateDepartmentMemberDto } from './dto/department.dto';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { Audit } from '../../common/audit/audit.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';

@ApiTags('Department')
@Controller('principal/departments')
@UseGuards(PrincipalAuthGuard)
@Audit('Department')
export class DepartmentController {
    constructor(private readonly departmentService: DepartmentService) { }

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
    ) {
        const schoolId = req.user.schoolId;
        return this.departmentService.getMembers(schoolId, id);
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
}
