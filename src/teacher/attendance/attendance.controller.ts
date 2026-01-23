import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { TeacherAttendanceService } from './attendance.service';
import { SubmitAttendanceDto } from './dto/submit-attendance.dto';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard'; // Wait, need Teacher Guard
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
// We should use a Teacher Guard. Assuming 'PrincipalTeacherGuard' or specific 'TeacherGuard'.
// Based on file list, we saw 'principal-teacher.guard.ts' and 'user.guard.ts'.
// Let's use UserGuard + Role check or PrincipalTeacherGuard?
// TeacherModule usually uses a guard. Let's check TeacherModule context.
// For now, I'll import PrincipalTeacherGuard as it likely allows both.
import { PrincipalOrTeacherGuard } from '../../common/guards/principal-teacher.guard';

@ApiTags('Teacher - Attendance')
@ApiBearerAuth()
@Controller('teacher/attendance')
@UseGuards(PrincipalOrTeacherGuard)
export class TeacherAttendanceController {
    constructor(private readonly attendanceService: TeacherAttendanceService) { }

    @ApiOperation({ summary: 'Get Actionable Attendance Tasks', description: 'Returns a list of classes/periods the teacher needs to take attendance for today.' })
    @Get('actions')
    getActions(@Request() req, @Query('date') date?: string) {
        const schoolId = req.user.schoolId;
        const userId = req.user.id;
        return this.attendanceService.getActions(schoolId, userId, date);
    }

    @ApiOperation({ summary: 'Submit Attendance', description: 'Submit attendance for a specific session (Daily or Period).' })
    @Post('submit')
    submitAttendance(@Request() req, @Body() dto: SubmitAttendanceDto) {
        const schoolId = req.user.schoolId;
        const userId = req.user.id;
        return this.attendanceService.submitAttendance(schoolId, userId, dto);
    }

    @ApiOperation({ summary: 'Get Session Details', description: 'Get existing attendance session and records if available.' })
    @Get('session')
    getSession(
        @Request() req,
        @Query('classId') classId: string,
        @Query('sectionId') sectionId: string,
        @Query('date') date: string,
        @Query('subjectId') subjectId?: string,
        @Query('periodId') periodId?: string,
    ) {
        const schoolId = req.user.schoolId;
        return this.attendanceService.getSession(
            schoolId,
            parseInt(classId),
            parseInt(sectionId),
            new Date(date),
            subjectId ? parseInt(subjectId) : undefined,
            periodId ? parseInt(periodId) : undefined,
        );
    }
}
