import { Controller, Post, Body, UseGuards, Request, UseInterceptors, UploadedFile } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { TeacherAuthGuard } from '../../common/guards/teacher.guard';
import { SchedulerService } from './scheduler.service';
import { SchedulePreviewDto } from './dto/schedule-preview.dto';

@ApiTags('Teacher - Auto-Pilot Scheduler')
@ApiBearerAuth()
@UseGuards(TeacherAuthGuard)
@Controller('teacher/scheduler')
export class SchedulerController {
    constructor(private readonly schedulerService: SchedulerService) { }

    @ApiOperation({ summary: 'Extract text from PDF or Image' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                },
            },
        },
    })
    @Post('extract')
    @UseInterceptors(FileInterceptor('file'))
    async extract(@UploadedFile() file: any) {
        const text = await this.schedulerService.extractText(file);
        return { text };
    }

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
}
