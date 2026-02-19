import { Controller, Post, Body, Param, UseGuards, Request, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TeacherAuthGuard } from '../common/guards/teacher.guard'; // Assume this exists
import { ExamAttendanceService } from './exam-attendance.service';

@ApiTags('Teacher - Exam')
@ApiBearerAuth()
@UseGuards(TeacherAuthGuard)
@Controller('teacher/exam')
export class ExamTeacherController {
    constructor(
        private readonly attendanceService: ExamAttendanceService,
    ) { }

    @Post(':examId/schedule/:scheduleId/attendance')
    @ApiOperation({ summary: 'Mark exam attendance' })
    async markAttendance(
        @Request() req,
        @Param('examId') examId: string,
        @Param('scheduleId') scheduleId: string,
        @Body() dto: { students: { studentId: number; isPresent: boolean; remarks?: string }[] },
    ) {
        const { schoolId, academicYearId } = req.user;
        return this.attendanceService.markAttendance(
            schoolId,
            academicYearId,
            +examId,
            +scheduleId,
            dto.students
        );
    }

    @Get('schedule/:scheduleId/attendance')
    @ApiOperation({ summary: 'Get exam attendance' })
    async getAttendance(@Request() req, @Param('scheduleId') scheduleId: string) {
        const { schoolId, academicYearId } = req.user;
        return this.attendanceService.getAttendance(schoolId, academicYearId, +scheduleId);
    }
}
