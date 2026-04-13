import { Controller, Get, Post, Patch, Body, Param, UseGuards, Request, ParseIntPipe, Delete, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiBody } from '@nestjs/swagger';
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
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                isCompleted: { type: 'boolean', example: true }
            },
            required: ['isCompleted']
        }
    })
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

    // ─────────────────────────────────────────────
    // SYLLABUS FILES (HOMEWORK Module PDF/Images)
    // ─────────────────────────────────────────────

    @Get(':id/syllabus-files')
    @ApiOperation({ summary: 'Get all uploaded syllabus files for a subject' })
    getSyllabusFiles(@Request() req, @Param('id', ParseIntPipe) id: number) {
        return this.subjectService.getSyllabusFiles(req.user.schoolId, req.user.id, id);
    }

    @Post(':id/syllabus-files')
    @UseInterceptors(FileInterceptor('file', {
        limits: {
            fileSize: 500 * 1024 * 1024, // 500MB
        },
    }))
    @ApiOperation({ summary: 'Upload a syllabus file (PDF/Image)' })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: { type: 'string', format: 'binary' },
                title: { type: 'string', description: 'Optional title for the file' }
            },
            required: ['file']
        }
    })
    uploadSyllabusFile(
        @Request() req,
        @Param('id', ParseIntPipe) id: number,
        @UploadedFile() file: any,
        @Body('title') title?: string
    ) {
        if (!file) throw new BadRequestException('No file provided');
        return this.subjectService.uploadSyllabusFile(req.user.schoolId, req.user.id, id, file, title);
    }

    @Delete(':id/syllabus-files/:fileId')
    @ApiOperation({ summary: 'Delete a syllabus file' })
    deleteSyllabusFile(
        @Request() req,
        @Param('id', ParseIntPipe) id: number,
        @Param('fileId', ParseIntPipe) fileId: number
    ) {
        return this.subjectService.deleteSyllabusFile(req.user.schoolId, req.user.id, id, fileId);
    }

    @Patch(':id/syllabus-files/:fileId')
    @ApiOperation({ summary: 'Update a syllabus file (rename)' })
    patchSyllabusFile(
        @Request() req,
        @Param('id', ParseIntPipe) id: number,
        @Param('fileId', ParseIntPipe) fileId: number,
        @Body('title') title: string
    ) {
        return this.subjectService.updateSyllabusFile(req.user.schoolId, req.user.id, id, fileId, title);
    }
}
