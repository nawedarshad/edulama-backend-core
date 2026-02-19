import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { LessonContentService } from './lesson-content.service';
import { LessonAnalyticsService } from './lesson-analytics.service';
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

    @ApiOperation({ summary: 'Get all lessons' })
    @Get()
    findAll(@Request() req) {
        const schoolId = req.user.schoolId;
        const academicYearId = req.user.academicYearId;
        return this.lessonService.findAll(schoolId, academicYearId);
    }

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
        const schoolId = req.user.schoolId;
        const academicYearId = req.user.academicYearId;
        // Keep explicit content route for backward compatibility if needed, 
        // but likely this was what I saw in 404 logs? No, logs said /teacher/lessons/1.
        // Actually, let's keep this as 'content/:id' AND add ':id'.
        return this.lessonService.getLessonUnion(schoolId, academicYearId, +id);
    }

    @ApiOperation({ summary: 'Get generic lesson/plan by ID' })
    @Get(':id')
    getLessonOrPlan(@Request() req, @Param('id') id: string) {
        const schoolId = req.user.schoolId;
        const academicYearId = req.user.academicYearId;
        return this.lessonService.getLessonUnion(schoolId, academicYearId, +id);
    }

    @ApiOperation({ summary: 'Get lessons by syllabus node' })
    @Get('by-syllabus/:syllabusId')
    getBySyllabus(@Request() req, @Param('syllabusId') syllabusId: string) {
        const schoolId = req.user.schoolId;
        const academicYearId = req.user.academicYearId;
        return this.lessonService.getLessonsBySyllabus(schoolId, academicYearId, +syllabusId);
    }



    @ApiOperation({ summary: 'Mark lesson as complete and add to diary' })
    @Patch(':id/complete')
    completeLesson(@Request() req, @Param('id') id: string, @Body() dto: any) {
        const schoolId = req.user.schoolId;
        const academicYearId = req.user.academicYearId;
        const userId = req.user.id;
        return this.lessonService.completeLesson(schoolId, userId, academicYearId, +id, dto);
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
