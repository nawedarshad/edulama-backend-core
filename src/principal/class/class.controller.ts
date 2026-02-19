import { Controller, Get, Post, Body, Req, UseGuards, Delete, Param, ParseIntPipe, Query, Patch } from '@nestjs/common';
import { ClassService } from './class.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { AssignClassTeacherDto } from './dto/assign-class-teacher.dto';
import { AssignHeadTeacherDto } from './dto/assign-head-teacher.dto';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { Audit } from '../../common/audit/audit.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';

import { BulkCreateClassDto } from './dto/bulk-create-class.dto';

import { RequiredModule } from '../../common/decorators/required-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';

@ApiTags('Class')
@Controller('principal/classes')
@UseGuards(PrincipalAuthGuard, ModuleGuard)
@RequiredModule('CLASSES')
@Audit('Class')
export class ClassController {
    constructor(private readonly classService: ClassService) { }

    @Get()
    @ApiOperation({ summary: 'List all classes' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiResponse({ status: 200, description: 'Return all classes.' })
    async findAll(
        @Req() req,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
    ) {
        const schoolId = req.user.schoolId;
        const pageNumber = page ? +page : 1;
        const limitNumber = limit ? +limit : 10;
        return this.classService.findAll(schoolId, pageNumber, limitNumber);
    }

    @Get('template')
    @ApiOperation({ summary: 'Get class creation template' })
    @ApiResponse({ status: 200, description: 'Return template for bulk creation.' })
    async getTemplate() {
        return this.classService.getTemplate();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a class by id' })
    @ApiResponse({ status: 200, description: 'Return the class.' })
    async findOne(@Req() req, @Param('id', ParseIntPipe) id: number) {
        const schoolId = req.user.schoolId;
        return this.classService.findOne(schoolId, id);
    }

    @Post()
    @ApiOperation({ summary: 'Create a class' })
    @ApiResponse({ status: 201, description: 'The class has been successfully created.' })
    async create(@Req() req, @Body() createClassDto: CreateClassDto) {
        const schoolId = req.user.schoolId;
        return this.classService.create(schoolId, createClassDto);
    }

    @Post('bulk')
    @ApiOperation({ summary: 'Bulk create classes' })
    @ApiResponse({ status: 201, description: 'Classes have been successfully created.' })
    async createBulk(@Req() req, @Body() dto: BulkCreateClassDto) {
        const schoolId = req.user.schoolId;
        return this.classService.createBulk(schoolId, dto);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update a class' })
    @ApiResponse({ status: 200, description: 'The class has been successfully updated.' })
    async update(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Body() updateClassDto: UpdateClassDto,
    ) {
        const schoolId = req.user.schoolId;
        return this.classService.update(schoolId, id, updateClassDto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a class' })
    @ApiResponse({ status: 200, description: 'The class has been successfully deleted.' })
    async remove(@Req() req, @Param('id', ParseIntPipe) id: number) {
        const schoolId = req.user.schoolId;
        return this.classService.remove(schoolId, id);
    }

    @Post('assign-teacher')
    @ApiOperation({ summary: 'Assign a class teacher to a section' })
    @ApiResponse({ status: 201, description: 'Teacher assigned to section.' })
    async assignTeacher(@Req() req, @Body() dto: AssignClassTeacherDto) {
        const schoolId = req.user.schoolId;
        return this.classService.assignClassTeacher(schoolId, dto);
    }

    @Post(':id/head-teacher')
    @ApiOperation({ summary: 'Assign a head teacher to a class' })
    @ApiResponse({ status: 201, description: 'Head teacher assigned.' })
    async assignHeadTeacher(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: AssignHeadTeacherDto
    ) {
        const schoolId = req.user.schoolId;
        // Ensure the ID in URL matches the logic if needed, but DTO is standard. 
        // Service expects classId. The Endpoint is /:id/head-teacher, so 'id' is classId.
        return this.classService.assignHeadTeacher(schoolId, id, dto);
    }

    @Delete(':id/head-teacher')
    @ApiOperation({ summary: 'Remove a head teacher from a class' })
    @ApiResponse({ status: 200, description: 'Head teacher removed.' })
    async removeHeadTeacher(@Req() req, @Param('id', ParseIntPipe) id: number) {
        const schoolId = req.user.schoolId;
        return this.classService.removeHeadTeacher(schoolId, id);
    }

    @Delete('sections/:sectionId/teacher')
    @ApiOperation({ summary: 'Remove a class teacher from a section' })
    @ApiResponse({ status: 200, description: 'Class teacher removed from section.' })
    async removeSectionTeacher(@Req() req, @Param('sectionId', ParseIntPipe) sectionId: number) {
        const schoolId = req.user.schoolId;
        return this.classService.removeSectionTeacher(schoolId, sectionId);
    }
}
