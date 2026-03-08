import {
    Controller, Get, Post, Body, Patch, Param, Delete,
    UseGuards, Request, Query
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TeacherHomeworkService } from './teacher-homework.service';
import { CreateHomeworkDto } from './dto/create-homework.dto';
import { UpdateHomeworkDto } from './dto/update-homework.dto';
import { HomeworkQueryDto } from './dto/homework-query.dto';
import { MarkSubmissionDto, BulkMarkSubmissionDto } from './dto/mark-submission.dto';
import { TeacherAuthGuard } from '../../common/guards/teacher.guard';
import { ModuleGuard } from '../../common/guards/module.guard';
import { RequiredModule } from '../../common/decorators/required-module.decorator';

@ApiTags('Teacher - Homework')
@ApiBearerAuth()
@UseGuards(TeacherAuthGuard, ModuleGuard)
@RequiredModule('HOMEWORK')
@Controller('teacher/homework')
export class TeacherHomeworkController {
    constructor(private readonly homeworkService: TeacherHomeworkService) { }

    // ── CRUD ──────────────────────────────────────────────────

    @ApiOperation({ summary: 'Create homework and auto-assign submission rows for section students' })
    @Post()
    create(@Request() req, @Body() dto: CreateHomeworkDto) {
        return this.homeworkService.create(req.user.schoolId, req.user.id, req.user.academicYearId, dto);
    }

    @ApiOperation({ summary: 'Get all homework assigned by this teacher (with submission stats)' })
    @Get()
    findAll(@Request() req, @Query() query: HomeworkQueryDto) {
        return this.homeworkService.findAll(req.user.schoolId, req.user.id, req.user.academicYearId, query);
    }

    @ApiOperation({ summary: 'Get single homework with full student submission list' })
    @Get(':id')
    findOne(@Request() req, @Param('id') id: string) {
        return this.homeworkService.findOne(req.user.schoolId, req.user.id, +id);
    }

    @ApiOperation({ summary: 'Update homework' })
    @Patch(':id')
    update(@Request() req, @Param('id') id: string, @Body() dto: UpdateHomeworkDto) {
        return this.homeworkService.update(req.user.schoolId, req.user.id, +id, dto);
    }

    @ApiOperation({ summary: 'Delete homework' })
    @Delete(':id')
    remove(@Request() req, @Param('id') id: string) {
        return this.homeworkService.remove(req.user.schoolId, req.user.id, +id);
    }

    // ── SUBMISSION TRACKING ────────────────────────────────────

    @ApiOperation({ summary: 'Mark a single student submission status' })
    @Post(':id/submissions')
    markSubmission(@Request() req, @Param('id') id: string, @Body() dto: MarkSubmissionDto) {
        return this.homeworkService.markSubmission(req.user.schoolId, req.user.id, +id, dto);
    }

    @ApiOperation({ summary: 'Bulk mark multiple student submissions at once' })
    @Post(':id/submissions/bulk')
    bulkMarkSubmissions(@Request() req, @Param('id') id: string, @Body() dto: BulkMarkSubmissionDto) {
        return this.homeworkService.bulkMarkSubmissions(req.user.schoolId, req.user.id, +id, dto.submissions);
    }
}
