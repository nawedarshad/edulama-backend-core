import { Body, Controller, Post, Get, Patch, Delete, Query, Param, UseGuards, Request, ParseIntPipe } from '@nestjs/common';
import { TeacherAttendanceService } from './teacher-attendance.service';
import { TakeAttendanceDto } from './dto/take-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { MarkStudentLateDto } from './dto/mark-student-late.dto';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';

// Assuming a standard authenticated guard that puts user in request
// the imports might need adjustment based on project structure for guards
import { TeacherAuthGuard } from 'src/common/guards/teacher.guard';

@ApiTags('Teacher Attendance')
@ApiBearerAuth()
@UseGuards(TeacherAuthGuard)
@Controller('teacher/attendance')
export class TeacherAttendanceController {
    constructor(private readonly service: TeacherAttendanceService) { }

    @Post()
    @ApiOperation({ summary: 'Take Attendance', description: 'Create a new attendance session. Supports UserID or StudentProfileID.' })
    async takeAttendance(@Request() req, @Body() dto: TakeAttendanceDto) {
        const userId = req.user.id;
        return this.service.takeAttendance(userId, dto);
    }

    @Get('session')
    @ApiOperation({ summary: 'Get Session Details', description: 'Get existing attendance session and records if available.' })
    getSession(
        @Request() req,
        @Query('classId', ParseIntPipe) classId: number,
        @Query('sectionId', ParseIntPipe) sectionId: number,
        @Query('date') date: string,
        @Query('subjectId') subjectId?: string,
        @Query('timePeriodId') timePeriodId?: string,
    ) {
        const schoolId = req.user.schoolId;
        return this.service.getSession(
            schoolId,
            classId,
            sectionId,
            new Date(date),
            subjectId ? parseInt(subjectId) : undefined,
            timePeriodId ? parseInt(timePeriodId) : undefined,
        );
    }

    @Get('monthly')
    @ApiOperation({ summary: 'Get Monthly Attendance', description: 'Get raw session data for a month.' })
    getMonthlyAttendance(
        @Request() req,
        @Query('classId', ParseIntPipe) classId: number,
        @Query('sectionId', ParseIntPipe) sectionId: number,
        @Query('year', ParseIntPipe) year: number,
        @Query('month', ParseIntPipe) month: number, // 1-12
        @Query('subjectId') subjectId?: string,
    ) {
        const schoolId = req.user.schoolId;
        return this.service.getMonthlyAttendance(
            schoolId,
            classId,
            sectionId,
            year,
            month,
            subjectId ? parseInt(subjectId) : undefined
        );
    }

    @Patch('update')
    @ApiOperation({ summary: 'Update Attendance', description: 'Update status/remarks for students in an existing session.' })
    async updateAttendance(@Request() req, @Body() dto: UpdateAttendanceDto) {
        const userId = req.user.id;
        return this.service.updateAttendance(userId, dto);
    }

    @Get('leaves')
    @ApiOperation({ summary: 'Get Leaves for Attendance', description: 'Get list of students on approved leave for the date.' })
    getLeaves(
        @Request() req,
        @Query('classId', ParseIntPipe) classId: number,
        @Query('sectionId', ParseIntPipe) sectionId: number,
        @Query('date') date: string,
    ) {
        return this.service.getLeavesForAttendance(
            req.user.schoolId,
            classId,
            sectionId,
            new Date(date)
        );
    }

    @Get('late-students')
    @ApiOperation({ summary: 'Get Late Students for Attendance', description: 'Get list of students marked as late for the date.' })
    getLateStudents(
        @Request() req,
        @Query('classId', ParseIntPipe) classId: number,
        @Query('sectionId', ParseIntPipe) sectionId: number,
        @Query('date') date: string,
    ) {
        return this.service.getLateStudentsForAttendance(
            req.user.schoolId,
            classId,
            sectionId,
            new Date(date)
        );
    }

    @Post('mark-late')
    @ApiOperation({ summary: 'Mark Student Late (Teacher)', description: 'Mark a student as arriving late. Only authorized Late Attendance Monitors can use this endpoint.' })
    async markStudentLate(@Request() req, @Body() dto: MarkStudentLateDto) {
        const userId = req.user.id;
        return this.service.markStudentLate(userId, dto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete Session', description: 'Delete an entire attendance session by ID.' })
    async deleteSession(@Request() req, @Param('id', ParseIntPipe) sessionId: number) {
        const userId = req.user.id;
        return this.service.deleteSession(userId, sessionId);
    }

    @Patch('unmark-late')
    @ApiOperation({ summary: 'Unmark Student Late', description: 'Revert a late marking. Restricted to Late Attendance Monitors.' })
    async unmarkLate(
        @Request() req,
        @Body() body: {
            schoolId: number,
            academicYearId: number,
            studentProfileId: number
        } // Ideally use a DTO
    ) {
        const userId = req.user.id;
        // In a real app we might get schoolId from req.user too (as seen in other methods `req.user.schoolId`)
        // The service method expects schoolId. Let's rely on req.user.schoolId for security if available.
        const schoolId = req.user.schoolId || body.schoolId;

        return this.service.unmarkStudentLate(
            userId,
            schoolId,
            body.academicYearId,
            body.studentProfileId
        );
    }

    @Get('config')
    @ApiOperation({ summary: 'Get Attendance Configuration', description: 'Get the school\'s attendance mode and responsibility for the current academic year.' })
    async getConfig(@Request() req, @Query('academicYearId', ParseIntPipe) academicYearId: number) {
        const schoolId = req.user.schoolId;
        return this.service.getConfig(schoolId, academicYearId);
    }

    @Get('daily-assignments')
    @ApiOperation({ summary: 'Get Daily Attendance Assignments', description: 'Returns classes/sections the teacher is authorized to take daily attendance for, based on tenant config.' })
    async getDailyAssignments(
        @Request() req,
        @Query('academicYearId', ParseIntPipe) academicYearId: number,
        @Query('date') date: string,
    ) {
        const userId = req.user.id;
        const schoolId = req.user.schoolId;
        return this.service.getDailyAssignments(userId, schoolId, academicYearId, date);
    }

    @Get('students')
    @ApiOperation({ summary: 'Get Students for Attendance', description: 'Get accessible students for the teacher.' })
    async getStudents(
        @Request() req,
        @Query('classId', ParseIntPipe) classId?: number,
        @Query('sectionId', ParseIntPipe) sectionId?: number,
    ) {
        const userId = req.user.id;
        const schoolId = req.user.schoolId;
        return this.service.getStudentsForAttendance(userId, schoolId, classId, sectionId);
    }

    @Get('monitor/search')
    @ApiOperation({ summary: 'Search Students (Monitor)', description: 'Search students by name/reg no. Restricted to Late Attendance Monitors.' })
    async searchMonitor(
        @Request() req,
        @Query('query') query: string,
    ) {
        const userId = req.user.id;
        const schoolId = req.user.schoolId;
        return this.service.searchStudentsForMonitor(userId, schoolId, query);
    }
}
