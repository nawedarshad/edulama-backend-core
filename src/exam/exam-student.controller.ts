import { Controller, Get, Param, UseGuards, Request, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { StudentAuthGuard } from '../common/guards/student.guard';
import { ExamScheduleService } from './exam-schedule.service';
import { ResultService } from './result.service';
import { AdmitCardService } from './admit-card.service';
import { ReportCardService } from './report-card.service';
import { ExamService } from './exam.service';

@ApiTags('Student - Exam')
@ApiBearerAuth()
@UseGuards(StudentAuthGuard)
@Controller('student/exam')
export class ExamStudentController {
    constructor(
        private readonly examService: ExamService,
        private readonly scheduleService: ExamScheduleService,
        private readonly resultService: ResultService,
        private readonly admitCardService: AdmitCardService,
        private readonly reportCardService: ReportCardService,
    ) { }

    @Get()
    @ApiOperation({ summary: 'Get my exams' })
    async getMyExams(@Request() req) {
        const { schoolId, academicYearId } = req.user;
        // Logic to find exams applicable for student's class
        // We can reuse find all and filter, or creating a new method in ExamService.
        // For now, let's fetch all exams and filter by class if possible, or just return all published exams.

        // Actually, ExamService.findAll filters by type/status.
        // We should filter by "published" or "scheduled".
        return this.examService.findAll(schoolId, academicYearId, { status: 'SCHEDULED' });
    }

    @Get(':examId/schedule')
    @ApiOperation({ summary: 'Get exam schedule' })
    async getSchedule(@Request() req, @Param('examId') examId: string) {
        const { schoolId, academicYearId, classId, sectionId } = req.user;
        // We can use generic findByExam, but ideally filter by class.
        // ExamScheduleService.findByExam returns all.
        // We can filter in controller or service.
        const schedules = await this.scheduleService.findByExam(schoolId, academicYearId, +examId);
        return schedules.filter(s => s.classId === classId && (s.sectionId === null || s.sectionId === sectionId));
    }

    @Get(':examId/admit-card')
    @ApiOperation({ summary: 'Get admit card' })
    async getAdmitCard(@Request() req, @Param('examId') examId: string) {
        const { schoolId, academicYearId, id: studentId } = req.user;
        return this.admitCardService.generateAdmitCard(schoolId, academicYearId, studentId, +examId);
    }

    @Get(':examId/result')
    @ApiOperation({ summary: 'Get exam result/report card' })
    async getResult(@Request() req, @Param('examId') examId: string) {
        const { schoolId, academicYearId, id: studentId } = req.user;
        return this.reportCardService.generateReportCard(schoolId, academicYearId, studentId, +examId);
    }
}
