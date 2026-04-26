import { Body, Controller, Post, Get, Patch, Delete, Query, Param, UseGuards, ParseIntPipe } from '@nestjs/common';
import { TeacherAttendanceService } from './teacher-attendance.service';
import { TakeAttendanceDto } from './dto/take-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { MarkStudentLateDto } from './dto/mark-student-late.dto';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsNumber, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { TeacherAuthGuard } from 'src/common/guards/teacher.guard';
import { GetUser, type AuthUserPayload } from 'src/common/decorators/get-user.decorator';

class UnmarkLateDto {
    @IsNumber()
    @IsNotEmpty()
    @Type(() => Number)
    academicYearId: number;

    @IsNumber()
    @IsNotEmpty()
    @Type(() => Number)
    studentProfileId: number;
}

@ApiTags('Teacher Attendance')
@ApiBearerAuth()
@UseGuards(TeacherAuthGuard)
@Controller('teacher/attendance')
export class TeacherAttendanceController {
    constructor(private readonly service: TeacherAttendanceService) { }

    @Post()
    @ApiOperation({ summary: 'Take Attendance' })
    takeAttendance(@GetUser() user: AuthUserPayload, @Body() dto: TakeAttendanceDto) {
        return this.service.takeAttendance(user.id, dto);
    }

    @Get('self')
    @ApiOperation({ summary: 'Get own monthly attendance' })
    getSelfAttendance(
        @GetUser() user: AuthUserPayload,
        @Query('month', ParseIntPipe) month: number,
        @Query('year', ParseIntPipe) year: number,
    ) {
        return this.service.getSelfAttendance(user.id, user.schoolId, month, year);
    }

    @Get('config')
    @ApiOperation({ summary: 'Get attendance configuration for the academic year' })
    getConfig(@GetUser() user: AuthUserPayload, @Query('academicYearId', ParseIntPipe) academicYearId: number) {
        return this.service.getConfig(user.schoolId, academicYearId);
    }

    @Get('daily-assignments')
    @ApiOperation({ summary: 'Classes/sections the teacher is authorized to mark daily attendance for' })
    getDailyAssignments(
        @GetUser() user: AuthUserPayload,
        @Query('academicYearId', ParseIntPipe) academicYearId: number,
        @Query('date') date: string,
    ) {
        return this.service.getDailyAssignments(user.id, user.schoolId, academicYearId, date);
    }

    @Get('session')
    @ApiOperation({ summary: 'Get existing session and records for a class/date' })
    getSession(
        @GetUser() user: AuthUserPayload,
        @Query('academicYearId', ParseIntPipe) academicYearId: number,
        @Query('classId', ParseIntPipe) classId: number,
        @Query('sectionId', ParseIntPipe) sectionId: number,
        @Query('date') date: string,
        @Query('subjectId') subjectId?: string,
        @Query('timePeriodId') timePeriodId?: string,
    ) {
        return this.service.getSession(
            user.schoolId, academicYearId, classId, sectionId, new Date(date),
            subjectId ? parseInt(subjectId) : undefined,
            timePeriodId ? parseInt(timePeriodId) : undefined,
        );
    }

    @Get('monthly')
    @ApiOperation({ summary: 'Get raw session data for a month' })
    getMonthlyAttendance(
        @GetUser() user: AuthUserPayload,
        @Query('academicYearId', ParseIntPipe) academicYearId: number,
        @Query('classId', ParseIntPipe) classId: number,
        @Query('sectionId', ParseIntPipe) sectionId: number,
        @Query('year', ParseIntPipe) year: number,
        @Query('month', ParseIntPipe) month: number,
        @Query('subjectId') subjectId?: string,
    ) {
        return this.service.getMonthlyAttendance(
            user.schoolId, academicYearId, classId, sectionId, year, month,
            subjectId ? parseInt(subjectId) : undefined,
        );
    }

    @Get('leaves')
    @ApiOperation({ summary: 'Students on approved leave for the date' })
    getLeaves(
        @GetUser() user: AuthUserPayload,
        @Query('classId', ParseIntPipe) classId: number,
        @Query('sectionId', ParseIntPipe) sectionId: number,
        @Query('date') date: string,
    ) {
        return this.service.getLeavesForAttendance(user.schoolId, classId, sectionId, new Date(date));
    }

    @Get('late-students')
    @ApiOperation({ summary: 'Students marked late for the date' })
    getLateStudents(
        @GetUser() user: AuthUserPayload,
        @Query('academicYearId', ParseIntPipe) academicYearId: number,
        @Query('classId', ParseIntPipe) classId: number,
        @Query('sectionId', ParseIntPipe) sectionId: number,
        @Query('date') date: string,
    ) {
        return this.service.getLateStudentsForAttendance(user.schoolId, academicYearId, classId, sectionId, new Date(date));
    }

    @Get('students')
    @ApiOperation({ summary: 'Active students for a class/section' })
    getStudents(
        @GetUser() user: AuthUserPayload,
        @Query('classId', ParseIntPipe) classId?: number,
        @Query('sectionId', ParseIntPipe) sectionId?: number,
    ) {
        return this.service.getStudentsForAttendance(user.id, user.schoolId, classId, sectionId);
    }

    @Get('monitor/search')
    @ApiOperation({ summary: 'Search students (Late Attendance Monitors only)' })
    searchMonitor(@GetUser() user: AuthUserPayload, @Query('query') query: string) {
        return this.service.searchStudentsForMonitor(user.id, user.schoolId, query);
    }

    @Patch('update')
    @ApiOperation({ summary: 'Update status/remarks for students in an existing session' })
    updateAttendance(@GetUser() user: AuthUserPayload, @Body() dto: UpdateAttendanceDto) {
        return this.service.updateAttendance(user.id, dto);
    }

    @Post('mark-late')
    @ApiOperation({ summary: 'Mark a student as late (Late Attendance Monitors only)' })
    markStudentLate(@GetUser() user: AuthUserPayload, @Body() dto: MarkStudentLateDto) {
        return this.service.markStudentLate(user.id, dto);
    }

    @Patch('unmark-late')
    @ApiOperation({ summary: 'Revert a late marking (Late Attendance Monitors only)' })
    unmarkLate(@GetUser() user: AuthUserPayload, @Body() body: UnmarkLateDto) {
        return this.service.unmarkStudentLate(user.id, user.schoolId, body.academicYearId, body.studentProfileId);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete an attendance session by ID' })
    deleteSession(@GetUser() user: AuthUserPayload, @Param('id', ParseIntPipe) sessionId: number) {
        return this.service.deleteSession(user.id, sessionId);
    }
}
