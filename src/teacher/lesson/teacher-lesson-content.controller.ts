import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { LessonContentService } from './lesson-content.service';
import { LessonAnalyticsService } from './lesson-analytics.service';
import { CreateLessonDto } from './dto/create-lesson.dto'; // Need to ensure DTO exists or use generic object for now if DTO not created
import { TeacherAuthGuard } from '../../common/guards/teacher.guard';

@ApiTags('Teacher - Lessons & Analytics')
@ApiBearerAuth()
@UseGuards(TeacherAuthGuard)
@Controller('teacher/lessons')
export class TeacherLessonContentController {
    constructor(
        private readonly lessonService: LessonContentService,
        private readonly analyticsService: LessonAnalyticsService
    ) { }

    // --- Content Management ---

    @ApiOperation({ summary: 'Create a new advanced lesson' })
    @Post('content')
    createLesson(@Request() req, @Body() dto: any) { // Using any for DTO to unblock, ideally CreateLessonDto
        const schoolId = req.user.schoolId;
        const academicYearId = req.user.academicYearId;
        return this.lessonService.createLesson(schoolId, academicYearId, dto);
    }

    @ApiOperation({ summary: 'Get lesson details' })
    @Get('content/:id')
    getLesson(@Request() req, @Param('id') id: string) {
        return this.lessonService.findOne(+id);
    }

    @ApiOperation({ summary: 'Get lessons by syllabus node' })
    @Get('by-syllabus/:syllabusId')
    getBySyllabus(@Param('syllabusId') syllabusId: string) {
        return this.lessonService.findBySyllabus(+syllabusId);
    }

    @ApiOperation({ summary: 'Add a quiz to a lesson' })
    @Post(':lessonId/quiz')
    addQuiz(@Request() req, @Param('lessonId') lessonId: string, @Body() dto: any) {
        const schoolId = req.user.schoolId;
        const academicYearId = req.user.academicYearId;
        return this.lessonService.createQuiz(schoolId, academicYearId, +lessonId, dto);
    }

    // --- Analytics ---

    @ApiOperation({ summary: 'Get class analytics' })
    @Get('analytics/class')
    getClassAnalytics(@Request() req, @Query('classId') classId: string, @Query('subjectId') subjectId: string) {
        const schoolId = req.user.schoolId;
        const academicYearId = req.user.academicYearId;
        return this.analyticsService.getClassAnalytics(schoolId, academicYearId, +classId, +subjectId);
    }

    @ApiOperation({ summary: 'Get student analytics' })
    @Get('analytics/student/:studentId')
    getStudentAnalytics(@Request() req, @Param('studentId') studentId: string) {
        const schoolId = req.user.schoolId;
        const academicYearId = req.user.academicYearId;
        return this.analyticsService.getStudentAnalytics(schoolId, academicYearId, +studentId);
    }
}
