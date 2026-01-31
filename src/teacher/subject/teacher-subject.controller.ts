import { Controller, Get, Post, Patch, Body, Param, UseGuards, Request, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { TeacherSubjectService } from './teacher-subject.service';
import { UserAuthGuard } from '../../common/guards/user.guard';
import { CreateSyllabusDto } from './dto/create-syllabus.dto';

@ApiTags('Teacher - Subjects')
@ApiBearerAuth()
@Controller('teacher/subjects')
@UseGuards(UserAuthGuard)
export class TeacherSubjectController {
    constructor(private readonly subjectService: TeacherSubjectService) { }

    @Get()
    @ApiOperation({ summary: 'Get all assigned subjects' })
    @ApiResponse({ status: 200, description: 'List of assigned subjects with class and section.' })
    findAll(@Request() req) {
        return this.subjectService.findAll(req.user.schoolId, req.user.id);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get details of a specific subject assignment' })
    @ApiResponse({ status: 200, description: 'Detailed subject view including syllabus and recent lessons.' })
    findOne(@Request() req, @Param('id', ParseIntPipe) id: number) {
        return this.subjectService.findOne(req.user.schoolId, req.user.id, id);
    }

    @Post(':id/syllabus')
    @ApiOperation({ summary: 'Add syllabus to a subject' })
    @ApiResponse({ status: 201, description: 'Syllabus added successfully.' })
    addSyllabus(
        @Request() req,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: CreateSyllabusDto
    ) {
        return this.subjectService.addSyllabus(req.user.schoolId, req.user.id, id, dto);
    }

    @Patch(':id/syllabus/:syllabusId/status')
    @ApiOperation({ summary: 'Mark syllabus topic as completed/incomplete' })
    @ApiResponse({ status: 200, description: 'Status updated successfully.' })
    updateSyllabusStatus(
        @Request() req,
        @Param('id', ParseIntPipe) id: number,
        @Param('syllabusId', ParseIntPipe) syllabusId: number,
        @Body() body: { isCompleted: boolean }
    ) {
        return this.subjectService.updateSyllabusStatus(req.user.schoolId, req.user.id, id, syllabusId, body.isCompleted);
    }

    @Patch(':id/syllabus/:syllabusId')
    @ApiOperation({ summary: 'Update syllabus details' })
    @ApiResponse({ status: 200, description: 'Syllabus updated successfully.' })
    updateSyllabus(
        @Request() req,
        @Param('id', ParseIntPipe) id: number,
        @Param('syllabusId', ParseIntPipe) syllabusId: number,
        @Body() dto: CreateSyllabusDto
    ) {
        return this.subjectService.updateSyllabus(req.user.schoolId, req.user.id, id, syllabusId, dto);
    }

    @Delete(':id/syllabus/:syllabusId') // Delete is a reserved word in JS but valid HTTP method
    @Post(':id/syllabus/:syllabusId/delete') // Alternative if Delete method has issues in some proxies, but usually @Delete is fine in Nest
    @ApiOperation({ summary: 'Delete a syllabus item' })
    @ApiResponse({ status: 200, description: 'Syllabus deleted successfully.' })
    deleteSyllabus(
        @Request() req,
        @Param('id', ParseIntPipe) id: number,
        @Param('syllabusId', ParseIntPipe) syllabusId: number
    ) {
        // NestJS explicitly uses @Delete for HTTP DELETE
        return this.subjectService.deleteSyllabus(req.user.schoolId, req.user.id, id, syllabusId);
    }
}
