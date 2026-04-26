import {
    Controller, Get, Post, Body, Patch, Param, Delete,
    UseGuards, Request, Query
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PrincipalHomeworkService } from './principal-homework.service';
import { PrincipalHomeworkQueryDto } from './dto/principal-homework-query.dto';
import { OverrideHomeworkDto } from './dto/override-homework.dto';
import { CreateHomeworkDto } from '../../teacher/homework/dto/create-homework.dto';
import { MarkSubmissionDto, BulkMarkSubmissionDto } from '../../teacher/homework/dto/mark-submission.dto';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { ModuleGuard } from '../../common/guards/module.guard';
import { RequiredModule } from '../../common/decorators/required-module.decorator';

@ApiTags('Principal - Homework')
@ApiBearerAuth()
@UseGuards(PrincipalAuthGuard, ModuleGuard)
@RequiredModule('HOMEWORK')
@Controller('principal/homework')
export class PrincipalHomeworkController {
    constructor(private readonly homeworkService: PrincipalHomeworkService) { }

    @ApiOperation({ summary: 'Principal creates homework directly (links to teacher via subject assignment)' })
    @Post()
    create(@Request() req, @Body() dto: CreateHomeworkDto) {
        return this.homeworkService.create(req.user.schoolId, req.user.id, req.user.academicYearId, dto);
    }

    @ApiOperation({ summary: 'View all homework across the school (with filters)' })
    @Get()
    findAll(@Request() req, @Query() query: PrincipalHomeworkQueryDto) {
        return this.homeworkService.findAll(req.user.schoolId, req.user.academicYearId, query);
    }

    @ApiOperation({ summary: 'View single homework with full submission list' })
    @Get(':id')
    findOne(@Request() req, @Param('id') id: string) {
        return this.homeworkService.findOne(req.user.schoolId, +id);
    }

    @ApiOperation({ summary: 'Override any homework (marks isOverriddenByPrincipal=true)' })
    @Patch(':id')
    override(@Request() req, @Param('id') id: string, @Body() dto: OverrideHomeworkDto) {
        return this.homeworkService.override(req.user.schoolId, req.user.id, +id, dto);
    }

    @ApiOperation({ summary: 'Delete any homework (principal privilege)' })
    @Delete(':id')
    remove(@Request() req, @Param('id') id: string) {
        return this.homeworkService.remove(req.user.schoolId, +id);
    }

    // ── SUBMISSION TRACKING ────────────────────────────────────

    @ApiOperation({ summary: 'Mark a single student submission status' })
    @Post(':id/submissions')
    markSubmission(@Request() req, @Param('id') id: string, @Body() dto: MarkSubmissionDto) {
        return this.homeworkService.markSubmission(req.user.schoolId, +id, dto);
    }

    @ApiOperation({ summary: 'Bulk mark multiple student submissions at once' })
    @Post(':id/bulk-mark')
    bulkMarkSubmissions(@Request() req, @Param('id') id: string, @Body() dto: BulkMarkSubmissionDto) {
        return this.homeworkService.bulkMarkSubmissions(req.user.schoolId, +id, dto.submissions);
    }
}
