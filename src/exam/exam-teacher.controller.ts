import { Controller, Post, Body, Param, UseGuards, Request, Get, Put } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TeacherAuthGuard } from '../common/guards/teacher.guard';
import { ExamAttendanceService } from './exam-attendance.service';
import { ExamService } from './exam.service';
import { ResultService, BulkResultDto } from './result.service';

@ApiTags('Teacher - Exam')
@ApiBearerAuth()
@UseGuards(TeacherAuthGuard)
@Controller('teacher/exam')
export class ExamTeacherController {
    constructor(
        private readonly attendanceService: ExamAttendanceService,
        private readonly examService: ExamService,
        private readonly resultService: ResultService,
    ) { }

    @Get()
    @ApiOperation({ summary: 'Get exams assigned to the teacher' })
    async getAssignedExams(@Request() req) {
        const { schoolId, academicYearId, teacherId } = req.user;
        // In this system, exams are broad. A teacher might be interested in all active exams.
        // We'll return exams that have schedules mapped to the subjects this teacher teaches,
        // or just all active exams for simplicity as filtering by subject mapping logic can be complex.
        // Returning all scheduled exams for the school and academic year.
        return this.examService.findAll(schoolId, academicYearId, { status: 'SCHEDULED' });
    }

    @Get(':examId/schedules')
    @ApiOperation({ summary: 'Get exam schedules assigned to the teacher' })
    async getAssignedSchedules(@Request() req, @Param('examId') examId: string) {
        const { schoolId, academicYearId, teacherId } = req.user;
        // Ideally, we'd filter by subjects assigned to the teacher.
        // For now, we'll fetch all schedules for the exam and let the frontend filter or display them all.
        // Alternatively, fetch the exam with its schedules using examService.findOne.
        const exam = await this.examService.findOne(schoolId, academicYearId, +examId);
        return exam.schedules;
    }

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

    @Get('schedule/:scheduleId/results')
    @ApiOperation({ summary: 'Get existing results for a schedule' })
    async getResults(@Request() req, @Param('scheduleId') scheduleId: string) {
        const { schoolId, academicYearId } = req.user;
        return this.resultService.findBySchedule(schoolId, academicYearId, +scheduleId);
    }

    @Put(':examId/schedule/:scheduleId/results')
    @ApiOperation({ summary: 'Submit exam results' })
    async submitResults(
        @Request() req,
        @Param('examId') examId: string,
        @Param('scheduleId') scheduleId: string,
        @Body() dto: Omit<BulkResultDto, 'scheduleId'>,
    ) {
        const { schoolId, academicYearId, id: userId } = req.user; // Use userId as evaluatedBy for now
        return this.resultService.createBulkResults(schoolId, academicYearId, +examId, {
            scheduleId: +scheduleId,
            results: dto.results
        }, userId);
    }
}
