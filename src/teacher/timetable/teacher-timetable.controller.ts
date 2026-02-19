import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TeacherAuthGuard } from '../../common/guards/teacher.guard';
import { TeacherTimetableService } from './teacher-timetable.service';
import { DateQueryDto } from './dto/date-query.dto';

import { RequiredModule } from '../../common/decorators/required-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';

@ApiTags('Teacher - Timetable')
@ApiBearerAuth()
@Controller('teacher/timetable')
@UseGuards(TeacherAuthGuard, ModuleGuard)
@RequiredModule('TIMETABLE')
export class TeacherTimetableController {
    constructor(private readonly timetableService: TeacherTimetableService) { }

    @ApiOperation({ summary: 'Get weekly standard timetable structure' })
    @Get('weekly')
    getWeeklyTimetable(@Request() req) {
        const schoolId = req.user.schoolId;
        const userId = req.user.id;
        const academicYearId = req.user.academicYearId; // Ensuring this is available on user object or passed
        return this.timetableService.getWeeklyTimetable(schoolId, userId, academicYearId);
    }

    @ApiOperation({ summary: 'Get timetable for a specific date (includes substitutions)' })
    @Get('daily')
    getDailyTimetable(@Request() req, @Query() query: DateQueryDto) {
        const schoolId = req.user.schoolId;
        const userId = req.user.id;
        const academicYearId = req.user.academicYearId;

        // Default to today if not provided
        const date = query.date || new Date().toISOString().split('T')[0];

        return this.timetableService.getDailyTimetable(schoolId, userId, academicYearId, date);
    }

    @ApiOperation({ summary: 'Get upcoming substitution duties' })
    @Get('substitutions')
    getSubstitutions(@Request() req) {
        const schoolId = req.user.schoolId;
        const userId = req.user.id;
        const academicYearId = req.user.academicYearId;
        return this.timetableService.getSubstitutions(schoolId, userId, academicYearId);
    }

    @ApiOperation({ summary: 'Get timetable for a date range' })
    @Get('range')
    getTimetableRange(@Request() req, @Query() query: DateQueryDto) {
        const schoolId = req.user.schoolId;
        const userId = req.user.id;
        const academicYearId = req.user.academicYearId;

        if (!query.startDate || !query.endDate) {
            // Default to current week? Or throw error?
            // Let's require dates or default to current week.
            // For now, let's assume valid input or throw in service if needed/validate in DTO.
            // But logic needs dates.
            // If missing, default to current week (Monday to Saturday)
            const today = new Date();
            const first = today.getDate() - today.getDay() + 1; // Monday
            const last = first + 5; // Saturday

            const start = new Date(today.setDate(first)).toISOString().split('T')[0];
            const end = new Date(today.setDate(last)).toISOString().split('T')[0];

            return this.timetableService.getTimetableRange(schoolId, userId, academicYearId, query.startDate || start, query.endDate || end);
        }

        return this.timetableService.getTimetableRange(schoolId, userId, academicYearId, query.startDate, query.endDate);
    }
}
