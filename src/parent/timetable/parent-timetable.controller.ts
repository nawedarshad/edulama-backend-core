import { Controller, Get, Param, ParseIntPipe, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserAuthGuard } from '../../common/guards/user.guard';
import { ParentTimetableService } from './parent-timetable.service';

@ApiTags('Parent - Timetable')
@ApiBearerAuth()
@Controller('parent/timetable')
@UseGuards(UserAuthGuard)
export class ParentTimetableController {
    constructor(private readonly timetableService: ParentTimetableService) { }

    @ApiOperation({ summary: 'Get weekly timetable for child' })
    @Get(':studentId/weekly')
    getWeeklyTimetable(
        @Request() req,
        @Param('studentId', ParseIntPipe) studentId: number
    ) {
        const schoolId = req.user.schoolId;
        const parentUserId = req.user.id;
        const academicYearId = req.user.academicYearId;
        return this.timetableService.getWeeklyTimetable(schoolId, parentUserId, studentId, academicYearId);
    }

    @ApiOperation({ summary: 'Get daily timetable for child' })
    @Get(':studentId/daily')
    getDailyTimetable(
        @Request() req,
        @Param('studentId', ParseIntPipe) studentId: number,
        @Query('date') date: string
    ) {
        const schoolId = req.user.schoolId;
        const parentUserId = req.user.id;
        const academicYearId = req.user.academicYearId;

        const targetDate = date || new Date().toISOString().split('T')[0];

        return this.timetableService.getDailyTimetable(schoolId, parentUserId, studentId, academicYearId, targetDate);
    }
}
