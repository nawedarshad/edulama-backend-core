import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, Query, UseGuards, Request, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SubjectService } from './subject.service';
import { CreateSubjectDto, UpdateSubjectDto, CreateClassSubjectDto, UpdateClassSubjectDto, CreateCategoryDto, UpdateCategoryDto, GetSubjectsQueryDto, BulkCopyDto } from './dto/subject.dto';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { RequiredModule } from '../../common/decorators/required-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { Audit } from '../../common/audit/audit.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';

@ApiTags('Principal - Subjects')
@ApiBearerAuth()
@Controller('principal/subject')
@UseGuards(PrincipalAuthGuard, ModuleGuard)
@RequiredModule('SUBJECTS')
@Audit('Subject Management')
export class SubjectController {
    @Get('health')
    healthCheck() {
        return { status: 'ok', module: 'SUBJECTS', timestamp: new Date().toISOString() };
    }

    private readonly logger = new Logger(SubjectController.name);

    constructor(private readonly subjectService: SubjectService) { }

    // ===================================================
    // SYLLABUS
    // ===================================================

    @ApiOperation({ summary: 'Get full syllabus tree for the school' })
    @Get('syllabus/all')
    getAllSyllabus(@GetUser('schoolId') schoolId: number) {
        return this.subjectService.getAllSyllabus(schoolId);
    }

    // ===================================================
    // STATS, FACULTY & EXPORTS
    // ===================================================

    @ApiOperation({ summary: 'Get faculty overview with their subject assignments' })
    @ApiResponse({ status: 200, description: 'List of faculty members and their active teaching load.' })
    @Get('faculty/overview')
    getFacultyOverview(@GetUser('schoolId') schoolId: number) {
        this.logger.log(`[School ${schoolId}] GET faculty/overview`);
        return this.subjectService.getFacultyOverview(schoolId);
    }

    @ApiOperation({ summary: 'Get subject statistics for the school' })
    @Get('stats')
    getStats(@GetUser('schoolId') schoolId: number) {
        return this.subjectService.getStats(schoolId);
    }

    @ApiOperation({ summary: 'Export all subjects as CSV' })
    @Get('export')
    exportSubjects(@GetUser('schoolId') schoolId: number) {
        return this.subjectService.exportSubjects(schoolId);
    }

    @ApiOperation({ summary: 'Export class subject assignments as CSV' })
    @Get('class-assignment/export')
    exportClassSubjects(@GetUser('schoolId') schoolId: number) {
        return this.subjectService.exportClassSubjects(schoolId);
    }


    // ===================================================
    // CATEGORIES
    // ===================================================

    @Post('category')
    @ApiOperation({ summary: 'Create a new subject category', description: 'Categories are used to group subjects (e.g. Scholastic, Co-Scholastic).' })
    @ApiResponse({ status: 201, description: 'Category created successfully.' })
    createCategory(
        @GetUser('schoolId') schoolId: number, 
        @GetUser('id') userId: number, 
        @Body() dto: CreateCategoryDto
    ) {
        return this.subjectService.createCategory(schoolId, dto, userId);
    }

    @ApiOperation({ summary: 'Get all subject categories' })
    @Get('category')
    findAllCategories(@GetUser('schoolId') schoolId: number) {
        return this.subjectService.findAllCategories(schoolId);
    }

    @Patch('category/:id')
    @ApiOperation({ summary: 'Update a subject category' })
    updateCategory(
        @GetUser('schoolId') schoolId: number, 
        @GetUser('id') userId: number, 
        @Param('id', ParseIntPipe) id: number, 
        @Body() dto: UpdateCategoryDto
    ) {
        return this.subjectService.updateCategory(schoolId, id, dto, userId);
    }

    @Delete('category/:id')
    removeCategory(
        @GetUser('schoolId') schoolId: number, 
        @GetUser('id') userId: number, 
        @Param('id', ParseIntPipe) id: number
    ) {
        return this.subjectService.removeCategory(schoolId, id, userId);
    }

    // ===================================================
    // CLASS SUBJECTS (Specific)
    // ===================================================

    @Post('class-assignment')
    @ApiOperation({ summary: 'Assign a subject to a class/section', description: 'Creates a link between a global subject and a specific class/section for the current academic year.' })
    @ApiResponse({ status: 201, description: 'Assignment created successfully.' })
    assignToClass(
        @GetUser('schoolId') schoolId: number, 
        @GetUser('id') userId: number, 
        @Body() dto: CreateClassSubjectDto
    ) {
        return this.subjectService.assignToClass(schoolId, dto, userId);
    }

    @ApiOperation({ summary: 'List subject assignments for a class/section' })
    @ApiQuery({ name: 'classId', required: false })
    @ApiQuery({ name: 'sectionId', required: false })
    @Get('class-assignment/list')
    getClassSubjects(
        @GetUser('schoolId') schoolId: number,
        @Query('classId', new ParseIntPipe({ optional: true })) classId?: number,
        @Query('sectionId', new ParseIntPipe({ optional: true })) sectionId?: number
    ) {
        return this.subjectService.getClassSubjects(schoolId, classId, sectionId);
    }

    @ApiOperation({ summary: 'Get subject configuration matrix for a class' })
    @ApiResponse({ status: 200, description: 'Subject-section grid for the class.' })
    @Get('class-assignment/matrix')
    getMatrix(
        @GetUser('schoolId') schoolId: number,
        @Query('classId', ParseIntPipe) classId: number
    ) {
        return this.subjectService.getMatrix(schoolId, classId);
    }

    @ApiOperation({ summary: 'Copy subject configuration from one class to another' })
    @Post('class-assignment/copy')
    bulkCopy(
        @GetUser('schoolId') schoolId: number,
        @Body() dto: BulkCopyDto,
        @GetUser('id') userId: number
    ) {
        return this.subjectService.bulkCopy(schoolId, dto, userId);
    }

    @ApiOperation({ summary: 'Get a specific class subject assignment by ID' })
    @Get('class-assignment/:assignmentId')
    getClassAssignment(
        @GetUser('schoolId') schoolId: number,
        @Param('assignmentId', ParseIntPipe) assignmentId: number
    ) {
        return this.subjectService.getClassAssignmentById(schoolId, assignmentId);
    }

    @ApiOperation({ summary: 'Get intelligent teacher recommendations for a subject and class' })
    @ApiQuery({ name: 'subjectId', required: true, type: Number })
    @ApiQuery({ name: 'classId', required: true, type: Number })
    @ApiResponse({ status: 200, description: 'List of recommended teachers based on preference and workload.' })
    @Get('allocation/suggestions')
    getTeacherSuggestions(
        @GetUser('schoolId') schoolId: number,
        @Query('subjectId', ParseIntPipe) subjectId: number,
        @Query('classId', ParseIntPipe) classId: number
    ) {
        return this.subjectService.getTeacherSuggestions(schoolId, subjectId, classId);
    }


    @Patch('class-assignment/:id')
    updateClassSubject(
        @GetUser('schoolId') schoolId: number, 
        @GetUser('id') userId: number, 
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateClassSubjectDto
    ) {
        return this.subjectService.updateClassSubject(schoolId, id, dto, userId);
    }

    @Delete('class-assignment/:id')
    removeClassSubject(
        @GetUser('schoolId') schoolId: number, 
        @GetUser('id') userId: number, 
        @Param('id', ParseIntPipe) id: number
    ) {
        return this.subjectService.removeClassSubject(schoolId, id, userId);
    }

    // ===================================================
    // GLOBAL SUBJECTS
    // ===================================================

    @Post()
    create(
        @GetUser('schoolId') schoolId: number, 
        @GetUser('id') userId: number, 
        @Body() dto: CreateSubjectDto
    ) {
        return this.subjectService.create(schoolId, dto, userId);
    }

    @ApiOperation({ summary: 'List all subjects for the current academic year' })
    @Get()
    findAll(@GetUser('schoolId') schoolId: number, @Query() query: GetSubjectsQueryDto) {
        return this.subjectService.findAll(schoolId, query);
    }

    @ApiOperation({ summary: 'Get a specific subject by ID' })
    @Get(':id')
    findOne(@GetUser('schoolId') schoolId: number, @Param('id', ParseIntPipe) id: number) {
        return this.subjectService.findOne(schoolId, id);
    }

    @Patch(':id')
    update(
        @GetUser('schoolId') schoolId: number, 
        @GetUser('id') userId: number, 
        @Param('id', ParseIntPipe) id: number, 
        @Body() dto: UpdateSubjectDto
    ) {
        return this.subjectService.update(schoolId, id, dto, userId);
    }

    @Delete(':id')
    remove(
        @GetUser('schoolId') schoolId: number, 
        @GetUser('id') userId: number, 
        @Param('id', ParseIntPipe) id: number
    ) {
        return this.subjectService.remove(schoolId, id, userId);
    }
}
