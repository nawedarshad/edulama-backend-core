import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserAuthGuard } from '../../common/guards/user.guard';
import { StudentTimetableService } from './student-timetable.service';

@ApiTags('Student - Timetable')
@ApiBearerAuth()
@Controller('student/timetable')
@UseGuards(UserAuthGuard)
export class StudentTimetableController {
    constructor(private readonly timetableService: StudentTimetableService) { }

    @ApiOperation({ summary: 'Get weekly timetable for my section' })
    @Get('weekly')
    getWeeklyTimetable(@Request() req) {
        const schoolId = req.user.schoolId;
        const userId = req.user.id;
        const academicYearId = req.user.academicYearId;
        return this.timetableService.getWeeklyTimetable(schoolId, userId, academicYearId);
    }

    @ApiOperation({ summary: 'Get daily timetable for my section' })
    @Get('daily')
    getDailyTimetable(@Request() req, @Query('date') date: string) {
        const schoolId = req.user.schoolId;
        const userId = req.user.id;
        const academicYearId = req.user.academicYearId;

        const targetDate = date || new Date().toISOString().split('T')[0];

        return this.timetableService.getDailyTimetable(schoolId, userId, academicYearId, targetDate);
    }
}
