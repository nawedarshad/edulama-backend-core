import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CalendarService } from 'src/principal/calendar/calendar.service';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { UserAuthGuard } from 'src/common/guards/user.guard';
import { GetCalendarDto } from 'src/principal/calendar/dto/calendar.dto';

import { RequiredModule } from '../../common/decorators/required-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';

@UseGuards(UserAuthGuard, ModuleGuard)
@RequiredModule('CALENDAR')
@Controller('teacher/calendar')
export class TeacherCalendarController {
    constructor(private calendarService: CalendarService) { }

    @Get()
    async getCalendar(
        @GetUser() user: any,
        @Query() dto: GetCalendarDto,
    ) {
        return this.calendarService.generateCalendar(user.schoolId, dto.startDate, dto.endDate, undefined, user.academicYearId);
    }
}
