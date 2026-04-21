import { Controller, Get, Post, Body, Query, UseGuards, UnauthorizedException, Delete, Param, ParseIntPipe, UseInterceptors } from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { SchoolAdminAttendanceService } from './school-admin-attendance.service';
import { GetDailyAttendanceDto } from './dto/get-daily-attendance.dto';
import { UpdateStaffAttendanceDto } from './dto/update-staff-attendance.dto';
import { TakeClassAttendanceDto } from './dto/take-class-attendance.dto';
import { AttendanceReportFilterDto } from './dto/attendance-report-wrapper.dto';
import { AssignLateMonitorsDto } from './dto/assign-late-monitors.dto';
import { MarkStudentLateDto } from '../../teacher/attendance/dto/mark-student-late.dto';
import { PrincipalAuthGuard } from 'src/common/guards/principal.guard';
import { type AuthUserPayload, GetUser } from 'src/common/decorators/get-user.decorator';

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
    async getDailyAttendance(@GetUser() user: AuthUserPayload, @Query() dto: GetDailyAttendanceDto) {
        this.validateRole(user);
        return this.service.getDailyAttendance(user.schoolId, dto.date);
    }

    @Post('daily')
    async saveDailyAttendance(@GetUser() user: AuthUserPayload, @Body() dto: UpdateStaffAttendanceDto) {
        this.validateRole(user);
        return this.service.saveDailyAttendance(user.schoolId, dto);
    }

    @Post('mark-late')
    async markStudentLate(@GetUser() user: AuthUserPayload, @Body() dto: MarkStudentLateDto) {
        this.validateRole(user);
        return this.service.markStudentLate(user.id, user.schoolId, dto);
    }

    @Get('late-monitors')
    async getLateMonitors(@GetUser() user: AuthUserPayload, @Query('academicYearId', ParseIntPipe) academicYearId: number) {
        this.validateRole(user);
        return this.service.getLateMonitors(user.schoolId, academicYearId);
    }

    @Post('late-monitors')
    async assignLateMonitors(@GetUser() user: AuthUserPayload, @Body() dto: AssignLateMonitorsDto) {
        this.validateRole(user);
        return this.service.assignLateMonitors(user.schoolId, dto);
    }

    @Post('session/take')
    async takeClassAttendance(@GetUser() user: AuthUserPayload, @Body() dto: TakeClassAttendanceDto) {
        this.validateRole(user);
        return this.service.takeClassAttendance(user.id, user.schoolId, dto);
    }

    @Get('session')
    async getClassSession(
        @GetUser() user: AuthUserPayload,
        @Query('academicYearId', ParseIntPipe) academicYearId: number,
        @Query('classId', ParseIntPipe) classId: number,
        @Query('sectionId', ParseIntPipe) sectionId: number,
        @Query('date') date: string,
        @Query('subjectId') subjectId?: string,
        @Query('timePeriodId') timePeriodId?: string,
    ) {
        this.validateRole(user);
        const d = new Date(date);
        const subId = subjectId ? parseInt(subjectId) : undefined;
        const pId = timePeriodId ? parseInt(timePeriodId) : undefined;
        return this.service.getClassSession(user.schoolId, academicYearId, classId, sectionId, d, subId, pId);
    }

    @Delete('session/:id')
    async deleteSession(@GetUser() user: AuthUserPayload, @Param('id', ParseIntPipe) id: number) {
        this.validateRole(user);
        return this.service.deleteSession(user.schoolId, id);
    }

    // --- REPORTS (CQRS Read Model Optimized) ---

    @Get('reports/late-arrivals/students')
    @UseInterceptors(CacheInterceptor)
    @CacheTTL(300000) // Cache for 5 minutes
    async getStudentLateReport(@GetUser() user: AuthUserPayload, @Query() dto: AttendanceReportFilterDto) {
        this.validateRole(user);
        return this.service.getReportStudentLate(user.schoolId, dto);
    }

    @Get('reports/absentees/students')
    @UseInterceptors(CacheInterceptor)
    @CacheTTL(300000) // Cache for 5 minutes
    async getStudentAbsentReport(@GetUser() user: AuthUserPayload, @Query() dto: AttendanceReportFilterDto) {
        this.validateRole(user);
        return this.service.getReportStudentAbsent(user.schoolId, dto);
    }

    @Get('reports/late-arrivals/teachers')
    async getTeacherLateReport(@GetUser() user: AuthUserPayload, @Query('date') date: string) {
        this.validateRole(user);
        return this.service.getReportTeacherLate(user.schoolId, date);
    }

    @Get('reports/absentees/teachers')
    async getTeacherAbsentReport(@GetUser() user: AuthUserPayload, @Query('date') date: string) {
        this.validateRole(user);
        return this.service.getReportTeacherAbsent(user.schoolId, date);
    }

    // --- ANALYTICS (CQRS Read Model Optimized) ---

    @Get('reports/class-comparison')
    @UseInterceptors(CacheInterceptor)
    @CacheTTL(600000) // Cache for 10 minutes
    async getClassComparisonReport(@GetUser() user: AuthUserPayload, @Query() dto: AttendanceReportFilterDto) {
        this.validateRole(user);
        return this.service.getClassComparisonReport(user.schoolId, dto);
    }

    @Get('reports/stats')
    @UseInterceptors(CacheInterceptor)
    @CacheTTL(60000) // Cache stats for 1 minute for near real-time updates
    async getAttendanceStats(@GetUser() user: AuthUserPayload, @Query() dto: AttendanceReportFilterDto) {
        this.validateRole(user);
        return this.service.getAttendanceStats(user.schoolId, dto);
    }

    @Get('reports/students/best-attendance')
    @UseInterceptors(CacheInterceptor)
    @CacheTTL(3600000) // Cache for 1 hour
    async getBestAttendance(@GetUser() user: AuthUserPayload, @Query() dto: AttendanceReportFilterDto) {
        this.validateRole(user);
        return this.service.getBestAttendance(user.schoolId, dto);
    }

    @Get('reports/students/worst-attendance')
    @UseInterceptors(CacheInterceptor)
    @CacheTTL(3600000) // Cache for 1 hour
    async getWorstAttendance(@GetUser() user: AuthUserPayload, @Query() dto: AttendanceReportFilterDto) {
        this.validateRole(user);
        return this.service.getWorstAttendance(user.schoolId, dto);
    }

    @Get('log/class')
    async getClassDailyLog(
        @GetUser() user: AuthUserPayload,
        @Query('academicYearId', ParseIntPipe) academicYearId: number,
        @Query('classId', ParseIntPipe) classId: number,
        @Query('sectionId', ParseIntPipe) sectionId: number,
        @Query('date') date: string,
    ) {
        this.validateRole(user);
        return this.service.getClassFullDayLog(user.schoolId, academicYearId, classId, sectionId, new Date(date));
    }
}
