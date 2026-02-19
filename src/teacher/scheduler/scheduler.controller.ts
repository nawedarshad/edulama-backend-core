import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TeacherAuthGuard } from '../../common/guards/teacher.guard';
import { SchedulerService, SchedulePreviewDto } from './scheduler.service';

@ApiTags('Teacher - Auto-Pilot Scheduler')
@ApiBearerAuth()
@UseGuards(TeacherAuthGuard)
@Controller('teacher/scheduler')
export class SchedulerController {
    constructor(private readonly schedulerService: SchedulerService) { }

    @ApiOperation({ summary: 'Preview the auto-generated schedule' })
    @Post('preview')
    async preview(@Request() req, @Body() dto: SchedulePreviewDto) {
        const schoolId = req.user.schoolId;
        const academicYearId = req.user.academicYearId;
        return this.schedulerService.simulateSchedule(schoolId, academicYearId, dto);
    }

    @ApiOperation({ summary: 'Commit the schedule to the diary/planner' })
    @Post('commit')
    async commit(@Request() req, @Body() dto: SchedulePreviewDto) {
        const schoolId = req.user.schoolId;
        const academicYearId = req.user.academicYearId;
        const teacherId = req.user.id;
        return this.schedulerService.commitSchedule(schoolId, academicYearId, dto, teacherId);
    }

    @ApiOperation({ summary: 'Check if a schedule already exists' })
    @Post('check-existing')
    async checkExisting(@Request() req, @Body() body: { classId: number, sectionId: number, subjectId: number }) {
        const schoolId = req.user.schoolId;
        const academicYearId = req.user.academicYearId;
        return this.schedulerService.checkExisting(schoolId, academicYearId, body.classId, body.sectionId, body.subjectId);
    }

    @ApiOperation({ summary: 'Load existing schedule for editing' })
    @Post('load-existing')
    async loadExisting(@Request() req, @Body() body: { classId: number, sectionId: number, subjectId: number }) {
        const schoolId = req.user.schoolId;
        const academicYearId = req.user.academicYearId;
        return this.schedulerService.loadExistingSchedule(schoolId, academicYearId, body.classId, body.sectionId, body.subjectId);
    }
}
