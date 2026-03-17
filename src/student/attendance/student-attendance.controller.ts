import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { StudentAttendanceService } from './student-attendance.service';
import { UserAuthGuard } from '../../common/guards/user.guard';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Student - Attendance')
@ApiBearerAuth()
@UseGuards(UserAuthGuard)
@Controller('student/attendance')
export class StudentAttendanceController {
    constructor(private readonly attendanceService: StudentAttendanceService) { }

    @ApiOperation({ summary: 'Get student self attendance for a month' })
    @Get('self')
    async getSelfAttendance(
        @Request() req,
        @Query('month') month: number,
        @Query('year') year: number,
    ) {
        return this.attendanceService.getStudentAttendance(req.user.id, req.user.schoolId, month, year);
    }
}
