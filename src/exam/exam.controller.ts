import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PrincipalAuthGuard } from '../common/guards/principal.guard';
import { ExamService, CreateExamDto, UpdateExamDto } from './exam.service';
import {
    ExamScheduleService,
    CreateExamScheduleDto,
    UpdateExamScheduleDto,
} from './exam-schedule.service';
import {
    SeatingService,
    CreateSeatingArrangementDto,
    GenerateSeatingDto,
} from './seating.service';
import {
    InvigilatorService,
    CreateInvigilatorDto,
    AssignInvigilatorsDto,
} from './invigilator.service';
import {
    QuestionPaperService,
    CreateQuestionPaperDto,
    CreateQuestionDto,
    UpdateQuestionPaperDto,
} from './question-paper.service';
import {
    ResultService,
    CreateResultDto,
    UpdateResultDto,
    BulkResultDto,
    PublishResultsDto,
} from './result.service';

@ApiTags('Principal - Exam Management')
@ApiBearerAuth()
@UseGuards(PrincipalAuthGuard)
@Controller('principal/exam')
export class ExamController {
    constructor(
        private readonly examService: ExamService,
        private readonly scheduleService: ExamScheduleService,
        private readonly seatingService: SeatingService,
        private readonly invigilatorService: InvigilatorService,
        private readonly questionPaperService: QuestionPaperService,
        private readonly resultService: ResultService,
    ) { }

    // ============================================================
    // EXAM CRUD
    // ============================================================

    @Post('auto-schedule')
    @ApiOperation({ summary: 'Generate auto-schedule based on parameters' })
    async autoSchedule(@Request() req, @Body() dto: any) {
        return this.examService.autoSchedule(req.user.schoolId, dto);
    }

    @Post()
    @ApiOperation({ summary: 'Create a new exam' })
    createExam(@Request() req, @Body() dto: CreateExamDto) {
        const { schoolId, academicYearId } = req.user;
        return this.examService.create(schoolId, academicYearId, dto);
    }

    @Get()
    @ApiOperation({ summary: 'Get all exams' })
    getAllExams(@Request() req, @Query('status') status?: string, @Query('type') type?: string) {
        const { schoolId, academicYearId } = req.user;
        return this.examService.findAll(schoolId, academicYearId, { status: status as any, type: type as any });
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get exam details' })
    getExam(@Request() req, @Param('id') id: string) {
        const { schoolId, academicYearId } = req.user;
        return this.examService.findOne(schoolId, academicYearId, +id);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update exam' })
    updateExam(@Request() req, @Param('id') id: string, @Body() dto: UpdateExamDto) {
        const { schoolId, academicYearId } = req.user;
        return this.examService.update(schoolId, academicYearId, +id, dto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete exam' })
    deleteExam(@Request() req, @Param('id') id: string) {
        const { schoolId, academicYearId } = req.user;
        return this.examService.delete(schoolId, academicYearId, +id);
    }

    @Get(':id/stats')
    @ApiOperation({ summary: 'Get exam statistics' })
    getExamStats(@Request() req, @Param('id') id: string) {
        const { schoolId, academicYearId } = req.user;
        return this.examService.getExamStats(schoolId, academicYearId, +id);
    }

    // ============================================================
    // EXAM SCHEDULE
    // ============================================================

    @Post(':examId/schedule')
    @ApiOperation({ summary: 'Create exam schedule' })
    createSchedule(@Request() req, @Param('examId') examId: string, @Body() dto: CreateExamScheduleDto) {
        const { schoolId, academicYearId } = req.user;
        return this.scheduleService.create(schoolId, academicYearId, { ...dto, examId: +examId });
    }

    @Get(':examId/schedule')
    @ApiOperation({ summary: 'Get exam schedules' })
    getSchedules(@Request() req, @Param('examId') examId: string) {
        const { schoolId, academicYearId } = req.user;
        return this.scheduleService.findByExam(schoolId, academicYearId, +examId);
    }

    @Get('schedule/:scheduleId')
    @ApiOperation({ summary: 'Get schedule details' })
    getSchedule(@Request() req, @Param('scheduleId') scheduleId: string) {
        const { schoolId, academicYearId } = req.user;
        return this.scheduleService.findOne(schoolId, academicYearId, +scheduleId);
    }

    @Put('schedule/:scheduleId')
    @ApiOperation({ summary: 'Update schedule' })
    updateSchedule(@Request() req, @Param('scheduleId') scheduleId: string, @Body() dto: UpdateExamScheduleDto) {
        const { schoolId, academicYearId } = req.user;
        return this.scheduleService.update(schoolId, academicYearId, +scheduleId, dto);
    }

    @Delete('schedule/:scheduleId')
    @ApiOperation({ summary: 'Delete schedule' })
    deleteSchedule(@Request() req, @Param('scheduleId') scheduleId: string) {
        const { schoolId, academicYearId } = req.user;
        return this.scheduleService.delete(schoolId, academicYearId, +scheduleId);
    }

    @Post(':examId/schedule/bulk')
    @ApiOperation({ summary: 'Create multiple schedules' })
    createBulkSchedules(@Request() req, @Param('examId') examId: string, @Body() dto: { schedules: CreateExamScheduleDto[] }) {
        const { schoolId, academicYearId } = req.user;
        const schedulesWithExamId = dto.schedules.map(s => ({ ...s, examId: +examId }));
        return this.scheduleService.createBulk(schoolId, academicYearId, schedulesWithExamId);
    }

    // ============================================================
    // SEATING ARRANGEMENT
    // ============================================================

    @Post(':examId/schedule/:scheduleId/seating')
    @ApiOperation({ summary: 'Create manual seating' })
    createSeating(
        @Request() req,
        @Param('examId') examId: string,
        @Param('scheduleId') scheduleId: string,
        @Body() dto: CreateSeatingArrangementDto,
    ) {
        const { schoolId, academicYearId } = req.user;
        return this.seatingService.createSeating(schoolId, academicYearId, +examId, +scheduleId, dto);
    }

    @Post(':examId/schedule/:scheduleId/seating/generate')
    @ApiOperation({ summary: 'Auto-generate seating arrangement' })
    generateSeating(
        @Request() req,
        @Param('examId') examId: string,
        @Param('scheduleId') scheduleId: string,
        @Body() dto: Omit<GenerateSeatingDto, 'scheduleId'>,
    ) {
        const { schoolId, academicYearId } = req.user;
        return this.seatingService.generateSeating(schoolId, academicYearId, +examId, {
            ...dto,
            scheduleId: +scheduleId,
        });
    }

    @Get('schedule/:scheduleId/seating')
    @ApiOperation({ summary: 'Get seating arrangements' })
    getSeating(@Request() req, @Param('scheduleId') scheduleId: string) {
        const { schoolId, academicYearId } = req.user;
        return this.seatingService.findBySchedule(schoolId, academicYearId, +scheduleId);
    }

    @Get('schedule/:scheduleId/seating/room/:roomId')
    @ApiOperation({ summary: 'Get seating by room' })
    getSeatingByRoom(@Request() req, @Param('scheduleId') scheduleId: string, @Param('roomId') roomId: string) {
        const { schoolId, academicYearId } = req.user;
        return this.seatingService.findByRoom(schoolId, academicYearId, +scheduleId, +roomId);
    }

    @Delete('seating/:seatingId')
    @ApiOperation({ summary: 'Delete seating' })
    deleteSeating(@Request() req, @Param('seatingId') seatingId: string) {
        const { schoolId, academicYearId } = req.user;
        return this.seatingService.delete(schoolId, academicYearId, +seatingId);
    }

    // ============================================================
    // INVIGILATOR ASSIGNMENT
    // ============================================================

    @Post(':examId/schedule/:scheduleId/invigilator')
    @ApiOperation({ summary: 'Assign invigilator' })
    assignInvigilator(
        @Request() req,
        @Param('examId') examId: string,
        @Param('scheduleId') scheduleId: string,
        @Body() dto: CreateInvigilatorDto,
    ) {
        const { schoolId, academicYearId } = req.user;
        return this.invigilatorService.assignInvigilator(schoolId, academicYearId, +examId, +scheduleId, dto);
    }

    @Post(':examId/schedule/:scheduleId/invigilator/bulk')
    @ApiOperation({ summary: 'Assign multiple invigilators' })
    assignBulkInvigilators(
        @Request() req,
        @Param('examId') examId: string,
        @Param('scheduleId') scheduleId: string,
        @Body() dto: Omit<AssignInvigilatorsDto, 'scheduleId'>,
    ) {
        const { schoolId, academicYearId } = req.user;
        return this.invigilatorService.assignBulk(schoolId, academicYearId, +examId, {
            ...dto,
            scheduleId: +scheduleId,
        });
    }

    @Post(':examId/schedule/:scheduleId/invigilator/auto')
    @ApiOperation({ summary: 'Auto-assign invigilators' })
    autoAssignInvigilators(@Request() req, @Param('examId') examId: string, @Param('scheduleId') scheduleId: string) {
        const { schoolId, academicYearId } = req.user;
        return this.invigilatorService.autoAssign(schoolId, academicYearId, +examId, +scheduleId);
    }

    @Get('schedule/:scheduleId/invigilator')
    @ApiOperation({ summary: 'Get invigilators for schedule' })
    getInvigilators(@Request() req, @Param('scheduleId') scheduleId: string) {
        const { schoolId, academicYearId } = req.user;
        return this.invigilatorService.findBySchedule(schoolId, academicYearId, +scheduleId);
    }

    @Delete('invigilator/:assignmentId')
    @ApiOperation({ summary: 'Delete invigilator assignment' })
    deleteInvigilator(@Request() req, @Param('assignmentId') assignmentId: string) {
        const { schoolId, academicYearId } = req.user;
        return this.invigilatorService.delete(schoolId, academicYearId, +assignmentId);
    }

    // ============================================================
    // QUESTION PAPER
    // ============================================================

    @Post(':examId/question-paper')
    @ApiOperation({ summary: 'Create question paper' })
    createQuestionPaper(@Request() req, @Param('examId') examId: string, @Body() dto: CreateQuestionPaperDto) {
        const { schoolId, academicYearId } = req.user;
        return this.questionPaperService.create(schoolId, academicYearId, +examId, dto);
    }

    @Get(':examId/question-paper')
    @ApiOperation({ summary: 'Get all question papers for exam' })
    getQuestionPapers(@Request() req, @Param('examId') examId: string) {
        const { schoolId, academicYearId } = req.user;
        return this.questionPaperService.findByExam(schoolId, academicYearId, +examId);
    }

    @Get('question-paper/schedule/:scheduleId')
    @ApiOperation({ summary: 'Get question paper by schedule' })
    getQuestionPaperBySchedule(@Request() req, @Param('scheduleId') scheduleId: string) {
        const { schoolId, academicYearId } = req.user;
        return this.questionPaperService.findBySchedule(schoolId, academicYearId, +scheduleId);
    }

    @Put('question-paper/:paperId')
    @ApiOperation({ summary: 'Update question paper' })
    updateQuestionPaper(@Request() req, @Param('paperId') paperId: string, @Body() dto: UpdateQuestionPaperDto) {
        const { schoolId, academicYearId } = req.user;
        return this.questionPaperService.update(schoolId, academicYearId, +paperId, dto);
    }

    @Delete('question-paper/:paperId')
    @ApiOperation({ summary: 'Delete question paper' })
    deleteQuestionPaper(@Request() req, @Param('paperId') paperId: string) {
        const { schoolId, academicYearId } = req.user;
        return this.questionPaperService.delete(schoolId, academicYearId, +paperId);
    }

    @Post('question-paper/:paperId/question')
    @ApiOperation({ summary: 'Add question to paper' })
    addQuestion(@Request() req, @Param('paperId') paperId: string, @Body() dto: CreateQuestionDto) {
        const { schoolId, academicYearId } = req.user;
        return this.questionPaperService.addQuestion(schoolId, academicYearId, +paperId, dto);
    }

    @Post('question-paper/:paperId/question/bulk')
    @ApiOperation({ summary: 'Add multiple questions' })
    addQuestionsBulk(@Request() req, @Param('paperId') paperId: string, @Body() dto: { questions: CreateQuestionDto[] }) {
        const { schoolId, academicYearId } = req.user;
        return this.questionPaperService.addQuestionsBulk(schoolId, academicYearId, +paperId, dto.questions);
    }

    // ============================================================
    // RESULTS
    // ============================================================

    @Post(':examId/schedule/:scheduleId/result')
    @ApiOperation({ summary: 'Create result' })
    createResult(
        @Request() req,
        @Param('examId') examId: string,
        @Param('scheduleId') scheduleId: string,
        @Body() dto: CreateResultDto,
    ) {
        const { schoolId, academicYearId, id: userId } = req.user;
        return this.resultService.createResult(schoolId, academicYearId, +examId, +scheduleId, dto, userId);
    }

    @Post(':examId/result/bulk')
    @ApiOperation({ summary: 'Create bulk results' })
    createBulkResults(@Request() req, @Param('examId') examId: string, @Body() dto: BulkResultDto) {
        const { schoolId, academicYearId, id: userId } = req.user;
        return this.resultService.createBulkResults(schoolId, academicYearId, +examId, dto, userId);
    }

    @Put('result/:resultId')
    @ApiOperation({ summary: 'Update result' })
    updateResult(@Request() req, @Param('resultId') resultId: string, @Body() dto: UpdateResultDto) {
        const { schoolId, academicYearId } = req.user;
        return this.resultService.updateResult(schoolId, academicYearId, +resultId, dto);
    }

    @Post('result/publish')
    @ApiOperation({ summary: 'Publish results' })
    publishResults(@Request() req, @Body() dto: PublishResultsDto) {
        const { schoolId, academicYearId } = req.user;
        return this.resultService.publishResults(schoolId, academicYearId, dto);
    }

    @Get('schedule/:scheduleId/result')
    @ApiOperation({ summary: 'Get results by schedule' })
    getResultsBySchedule(@Request() req, @Param('scheduleId') scheduleId: string) {
        const { schoolId, academicYearId } = req.user;
        return this.resultService.findBySchedule(schoolId, academicYearId, +scheduleId);
    }

    @Get(':examId/performance')
    @ApiOperation({ summary: 'Get exam performance analytics' })
    getExamPerformance(@Request() req, @Param('examId') examId: string) {
        const { schoolId, academicYearId } = req.user;
        return this.resultService.getExamPerformance(schoolId, academicYearId, +examId);
    }
}
