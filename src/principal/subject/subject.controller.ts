import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SubjectService } from './subject.service';
import { CreateSubjectDto, UpdateSubjectDto, CreateClassSubjectDto, UpdateClassSubjectDto, CreateCategoryDto, UpdateCategoryDto, GetSubjectsQueryDto } from './dto/subject.dto';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { RequiredModule } from '../../common/decorators/required-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';

@ApiTags('Principal - Subjects')
@ApiBearerAuth()
@Controller('principal/subject')
@UseGuards(PrincipalAuthGuard, ModuleGuard)
@RequiredModule('SUBJECTS')
export class SubjectController {
    constructor(private readonly subjectService: SubjectService) { }

    // ===================================================
    // SYLLABUS
    // ===================================================

    @ApiOperation({ summary: 'Get full syllabus tree for the school' })
    @Get('syllabus/all')
    getAllSyllabus(@Request() req) {
        return this.subjectService.getAllSyllabus(req.user.schoolId);
    }

    // ===================================================
    // STATS & EXPORTS
    // ===================================================

    @ApiOperation({ summary: 'Get subject statistics for the school' })
    @Get('stats')
    getStats(@Request() req) {
        return this.subjectService.getStats(req.user.schoolId);
    }

    @ApiOperation({ summary: 'Export all subjects as CSV' })
    @Get('export')
    exportSubjects(@Request() req) {
        return this.subjectService.exportSubjects(req.user.schoolId);
    }

    @ApiOperation({ summary: 'Export class subject assignments as CSV' })
    @Get('class-assignment/export')
    exportClassSubjects(@Request() req) {
        return this.subjectService.exportClassSubjects(req.user.schoolId);
    }


    // ===================================================
    // CATEGORIES
    // ===================================================

    @Post('category')
    @ApiOperation({ summary: 'Create a new subject category', description: 'Categories are used to group subjects (e.g. Scholastic, Co-Scholastic).' })
    @ApiResponse({ status: 201, description: 'Category created successfully.' })
    createCategory(@Request() req, @Body() dto: CreateCategoryDto) {
        return this.subjectService.createCategory(req.user.schoolId, dto, req.user.id);
    }

    @ApiOperation({ summary: 'Get all subject categories' })
    @Get('category')
    findAllCategories(@Request() req) {
        return this.subjectService.findAllCategories(req.user.schoolId);
    }

    @Patch('category/:id')
    @ApiOperation({ summary: 'Update a subject category' })
    updateCategory(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoryDto) {
        return this.subjectService.updateCategory(req.user.schoolId, id, dto, req.user.id);
    }

    @Delete('category/:id')
    removeCategory(@Request() req, @Param('id', ParseIntPipe) id: number) {
        return this.subjectService.removeCategory(req.user.schoolId, id, req.user.id);
    }

    // ===================================================
    // CLASS SUBJECTS (Specific)
    // ===================================================

    @Post('class-assignment')
    @ApiOperation({ summary: 'Assign a subject to a class/section', description: 'Creates a link between a global subject and a specific class/section for the current academic year.' })
    @ApiResponse({ status: 201, description: 'Assignment created successfully.' })
    assignToClass(@Request() req, @Body() dto: CreateClassSubjectDto) {
        return this.subjectService.assignToClass(req.user.schoolId, dto, req.user.id);
    }

    @ApiOperation({ summary: 'List subject assignments for a class/section' })
    @ApiQuery({ name: 'classId', required: false })
    @ApiQuery({ name: 'sectionId', required: false })
    @Get('class-assignment/list')
    getClassSubjects(
        @Request() req,
        @Query('classId') classId?: string,
        @Query('sectionId') sectionId?: string
    ) {
        return this.subjectService.getClassSubjects(
            req.user.schoolId,
            classId ? parseInt(classId) : undefined,
            sectionId ? parseInt(sectionId) : undefined
        );
    }

    @Patch('class-assignment/:id')
    updateClassSubject(
        @Request() req,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateClassSubjectDto
    ) {
        return this.subjectService.updateClassSubject(req.user.schoolId, id, dto, req.user.id);
    }

    @Delete('class-assignment/:id')
    removeClassSubject(
        @Request() req,
        @Param('id', ParseIntPipe) id: number
    ) {
        return this.subjectService.removeClassSubject(req.user.schoolId, id, req.user.id);
    }

    // ===================================================
    // GLOBAL SUBJECTS
    // ===================================================

    @Post()
    create(@Request() req, @Body() dto: CreateSubjectDto) {
        return this.subjectService.create(req.user.schoolId, dto, req.user.id);
    }

    @ApiOperation({ summary: 'List all subjects for the current academic year' })
    @Get()
    findAll(@Request() req, @Query() query: GetSubjectsQueryDto) {
        return this.subjectService.findAll(req.user.schoolId, query);
    }

    @ApiOperation({ summary: 'Get a specific subject by ID' })
    @Get(':id')
    findOne(@Request() req, @Param('id', ParseIntPipe) id: number) {
        return this.subjectService.findOne(req.user.schoolId, id);
    }

    @Patch(':id')
    update(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSubjectDto) {
        return this.subjectService.update(req.user.schoolId, id, dto, req.user.id);
    }

    @Delete(':id')
    remove(@Request() req, @Param('id', ParseIntPipe) id: number) {
        return this.subjectService.remove(req.user.schoolId, id, req.user.id);
    }
}
