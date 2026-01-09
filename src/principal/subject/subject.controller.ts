import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SubjectService } from './subject.service';
import { CreateSubjectDto, UpdateSubjectDto, CreateClassSubjectDto, UpdateClassSubjectDto } from './dto/subject.dto';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';

@ApiTags('Principal - Subjects')
@ApiBearerAuth()
@Controller('principal/subject')
@UseGuards(PrincipalAuthGuard)
export class SubjectController {
    constructor(private readonly subjectService: SubjectService) { }

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

    @ApiOperation({ summary: 'Create a new subject category' })
    @Post('category')
    createCategory(@Request() req, @Body() dto: any) {
        return this.subjectService.createCategory(req.user.schoolId, dto);
    }

    @ApiOperation({ summary: 'Get all subject categories' })
    @Get('category')
    findAllCategories(@Request() req) {
        return this.subjectService.findAllCategories(req.user.schoolId);
    }

    @ApiOperation({ summary: 'Update a subject category' })
    @Patch('category/:id')
    updateCategory(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() dto: any) {
        return this.subjectService.updateCategory(req.user.schoolId, id, dto);
    }

    @ApiOperation({ summary: 'Delete a subject category' })
    @Delete('category/:id')
    removeCategory(@Request() req, @Param('id', ParseIntPipe) id: number) {
        return this.subjectService.removeCategory(req.user.schoolId, id);
    }

    // ===================================================
    // GLOBAL SUBJECTS
    // ===================================================

    @ApiOperation({ summary: 'Create a new global subject (School/Year scoped)' })
    @Post()
    create(@Request() req, @Body() dto: CreateSubjectDto) {
        return this.subjectService.create(req.user.schoolId, dto);
    }

    @ApiOperation({ summary: 'List all subjects for the current academic year' })
    @Get()
    findAll(@Request() req, @Query() query: any) { // Ideally use a DTO here, but `any` works for now or create `GetSubjectsDto`
        return this.subjectService.findAll(req.user.schoolId, query);
    }

    @ApiOperation({ summary: 'Get a specific subject by ID' })
    @Get(':id')
    findOne(@Request() req, @Param('id', ParseIntPipe) id: number) {
        return this.subjectService.findOne(req.user.schoolId, id);
    }

    @ApiOperation({ summary: 'Update a subject' })
    @Patch(':id')
    update(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSubjectDto) {
        return this.subjectService.update(req.user.schoolId, id, dto);
    }

    @ApiOperation({ summary: 'Delete a subject' })
    @Delete(':id')
    remove(@Request() req, @Param('id', ParseIntPipe) id: number) {
        return this.subjectService.remove(req.user.schoolId, id);
    }

    // ===================================================
    // CLASS SUBJECTS (Specific)
    // ===================================================

    @ApiOperation({ summary: 'Assign a subject to a class (and optionally section)' })
    @Post('class-assignment')
    assignToClass(@Request() req, @Body() dto: CreateClassSubjectDto) {
        return this.subjectService.assignToClass(req.user.schoolId, dto);
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

    @ApiOperation({ summary: 'Update a class subject assignment' })
    @Patch('class-assignment/:id')
    updateClassSubject(
        @Request() req,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateClassSubjectDto
    ) {
        return this.subjectService.updateClassSubject(req.user.schoolId, id, dto);
    }

    @ApiOperation({ summary: 'Remove a class subject assignment' })
    @Delete('class-assignment/:id')
    removeClassSubject(
        @Request() req,
        @Param('id', ParseIntPipe) id: number
    ) {
        return this.subjectService.removeClassSubject(req.user.schoolId, id);
    }
}
