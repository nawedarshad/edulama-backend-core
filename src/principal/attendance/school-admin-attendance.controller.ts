
import { Controller, Get, Post, Body, Query, UseGuards, Request, UnauthorizedException, Delete, Param, ParseIntPipe } from '@nestjs/common';
import { SchoolAdminAttendanceService } from './school-admin-attendance.service';
import { GetDailyAttendanceDto } from './dto/get-daily-attendance.dto';
import { UpdateStaffAttendanceDto } from './dto/update-staff-attendance.dto';
import { TakeClassAttendanceDto } from './dto/take-class-attendance.dto';
import { AttendanceReportFilterDto } from './dto/attendance-report-wrapper.dto';
import { MarkStudentLateDto } from '../../teacher/attendance/dto/mark-student-late.dto';
import { PrincipalAuthGuard } from 'src/common/guards/principal.guard';
import { AuthUserPayload } from 'src/common/decorators/get-user.decorator';

@Controller('school-admin/attendance')
@UseGuards(PrincipalAuthGuard)
export class SchoolAdminAttendanceController {
    constructor(private readonly service: SchoolAdminAttendanceService) { }

    private validateRole(user: AuthUserPayload) {
        if (user.role !== 'SCHOOL_ADMINISTRATOR' && user.role !== 'PRINCIPAL') {
            throw new UnauthorizedException('Only School Administrators or Principals can access this resource.');
        }
    }

    @Get('daily')
    async getDailyAttendance(@Request() req, @Query() dto: GetDailyAttendanceDto) {
        this.validateRole(req.user);
        return this.service.getDailyAttendance(req.user.schoolId, dto.date);
    }

    @Post('daily')
    async saveDailyAttendance(@Request() req, @Body() dto: UpdateStaffAttendanceDto) {
        this.validateRole(req.user);
        return this.service.saveDailyAttendance(req.user.schoolId, dto);
    }

    @Post('mark-late')
    async markStudentLate(@Request() req, @Body() dto: MarkStudentLateDto) {
        this.validateRole(req.user);
        return this.service.markStudentLate(req.user.id, dto);
    }

    @Get('late-monitors')
    async getLateMonitors(@Request() req, @Query('academicYearId', ParseIntPipe) academicYearId: number) {
        this.validateRole(req.user);
        return this.service.getLateMonitors(req.user.id, academicYearId);
    }

    @Post('session/take')
    async takeClassAttendance(@Request() req, @Body() dto: TakeClassAttendanceDto) {
        this.validateRole(req.user);
        return this.service.takeClassAttendance(req.user.id, dto);
    }

    @Get('session')
    async getClassSession(
        @Request() req,
        @Query('classId', ParseIntPipe) classId: number,
        @Query('sectionId', ParseIntPipe) sectionId: number,
        @Query('date') date: string,
        @Query('subjectId') subjectId?: string,
        @Query('timePeriodId') timePeriodId?: string,
    ) {
        this.validateRole(req.user);
        const d = new Date(date);
        const subId = subjectId ? parseInt(subjectId) : undefined;
        const pId = timePeriodId ? parseInt(timePeriodId) : undefined;
        return this.service.getClassSession(req.user.id, classId, sectionId, d, subId, pId);
    }

    @Delete('session/:id')
    async deleteSession(@Request() req, @Param('id', ParseIntPipe) id: number) {
        this.validateRole(req.user);
        return this.service.deleteSession(req.user.id, id);
    }

    // --- REPORTS ---

    @Get('reports/late-arrivals/students')
    async getStudentLateReport(@Request() req, @Query() dto: AttendanceReportFilterDto) {
        this.validateRole(req.user);
        return this.service.getReportStudentLate(req.user.id, dto);
    }

    @Get('reports/absentees/students')
    async getStudentAbsentReport(@Request() req, @Query() dto: AttendanceReportFilterDto) {
        this.validateRole(req.user);
        return this.service.getReportStudentAbsent(req.user.id, dto);
    }

    @Get('reports/late-arrivals/teachers')
    async getTeacherLateReport(@Request() req, @Query('date') date: string) {
        this.validateRole(req.user);
        return this.service.getReportTeacherLate(req.user.schoolId, date);
    }

    @Get('reports/absentees/teachers')
    async getTeacherAbsentReport(@Request() req, @Query('date') date: string) {
        this.validateRole(req.user);
        return this.service.getReportTeacherAbsent(req.user.schoolId, date);
    }

    // --- ANALYTICS ---

    @Get('reports/class-comparison')
    async getClassComparisonReport(@Request() req, @Query() dto: AttendanceReportFilterDto) {
        this.validateRole(req.user);
        return this.service.getClassComparisonReport(req.user.schoolId, dto);
    }

    @Get('reports/stats')
    async getAttendanceStats(@Request() req, @Query() dto: AttendanceReportFilterDto) {
        this.validateRole(req.user);
        return this.service.getAttendanceStats(req.user.schoolId, dto);
    }

    @Get('reports/students/best-attendance')
    async getBestAttendance(@Request() req, @Query() dto: AttendanceReportFilterDto) {
        this.validateRole(req.user);
        return this.service.getBestAttendance(req.user.schoolId, dto);
    }

    @Get('reports/students/worst-attendance')
    async getWorstAttendance(@Request() req, @Query() dto: AttendanceReportFilterDto) {
        this.validateRole(req.user);
        return this.service.getWorstAttendance(req.user.schoolId, dto);
    }
}
