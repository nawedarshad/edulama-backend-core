import { Controller, Get, Request, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PrincipalLessonTrackerService, LessonTrackerItem } from './lesson-tracker.service';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';

import { RequiredModule } from '../../common/decorators/required-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';

@ApiTags('Principal - Lesson Tracker')
@ApiBearerAuth()
@UseGuards(PrincipalAuthGuard, ModuleGuard)
@RequiredModule('LESSON_PLANNING')
@Controller('principal/lesson-tracker')
export class PrincipalLessonTrackerController {
    constructor(private readonly trackerService: PrincipalLessonTrackerService) { }

    @ApiOperation({ summary: 'Get lesson progress tracker for all classes' })
    @Get()
    async getTrackerData(@Request() req): Promise<LessonTrackerItem[]> {
        const schoolId = req.user.schoolId;
        const academicYearId = req.user.academicYearId;
        return this.trackerService.getTrackerData(schoolId, academicYearId);
    }

    @ApiOperation({ summary: 'Get detailed lesson plans for a specific subject' })
    @Get('subject-detail')
    async getSubjectDetail(
        @Request() req,
        @Query('classId') classId: string,
        @Query('sectionId') sectionId: string,
        @Query('subjectId') subjectId: string
    ) {
        const schoolId = req.user.schoolId;
        const academicYearId = req.user.academicYearId;
        return this.trackerService.getSubjectDetail(
            schoolId,
            academicYearId,
            +classId,
            +sectionId,
            +subjectId
        );
    }
}
