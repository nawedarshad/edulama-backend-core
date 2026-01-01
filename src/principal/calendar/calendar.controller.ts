import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, ParseIntPipe, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CalendarService } from './calendar.service';
import { SetWorkingPatternDto, CreateCalendarExceptionDto, UpdateCalendarExceptionDto } from './dto/calendar.dto';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';

@ApiTags('Principal - Calendar')
@UseGuards(PrincipalAuthGuard)
@Controller('principal/calendar')
export class CalendarController {
    constructor(private service: CalendarService) { }

    @ApiOperation({ summary: 'Get Working Pattern', description: 'Get the weekly working days configuration.' })
    @Get('working-pattern')
    getWorkingPattern(
        @Req() req,
        @Query('academicYearId', ParseIntPipe) academicYearId: number,
    ) {
        return this.service.getWorkingPattern(req.user.schoolId, academicYearId);
    }

    @ApiOperation({ summary: 'Set Working Pattern', description: 'Define which days of the week are working days.' })
    @Put('working-pattern')
    setWorkingPattern(@Req() req, @Body() dto: SetWorkingPatternDto) {
        return this.service.setWorkingPattern(req.user.schoolId, dto);
    }

    @ApiOperation({ summary: 'List Exceptions', description: 'Get all holidays and special events.' })
    @Get('exceptions')
    getExceptions(
        @Req() req,
        @Query('academicYearId', ParseIntPipe) academicYearId: number,
    ) {
        return this.service.getExceptions(req.user.schoolId, academicYearId);
    }

    @ApiOperation({ summary: 'Add Exception', description: 'Add a holiday or special event.' })
    @Post('exceptions')
    addException(@Req() req, @Body() dto: CreateCalendarExceptionDto) {
        return this.service.addException(req.user.schoolId, dto);
    }

    @ApiOperation({ summary: 'Update Exception', description: 'Modify an existing exception.' })
    @Patch('exceptions/:id')
    updateException(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateCalendarExceptionDto,
    ) {
        return this.service.updateException(req.user.schoolId, id, dto);
    }

    @ApiOperation({ summary: 'Delete Exception', description: 'Remove an exception.' })
    @Delete('exceptions/:id')
    deleteException(@Req() req, @Param('id', ParseIntPipe) id: number) {
        return this.service.deleteException(req.user.schoolId, id);
    }

    @ApiOperation({ summary: 'Generate Calendar', description: 'Get daily calendar status for a range.' })
    @Get()
    async generateCalendar(
        @Req() req,
        @Query('month') month?: number,
        @Query('year') year?: number,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('classId') classId?: number,
    ) {
        // ... implementation existing ...
        // Backward Compatibility for month/year params
        if (month && year) {
            const start = new Date(year, month - 1, 1);
            const end = new Date(year, month, 0);
            return this.service.generateCalendar(
                req.user.schoolId,
                start.toISOString().split('T')[0],
                end.toISOString().split('T')[0],
                classId ? Number(classId) : undefined
            );
        }

        if (startDate && endDate) {
            return this.service.generateCalendar(
                req.user.schoolId,
                startDate,
                endDate,
                classId ? Number(classId) : undefined
            );
        }

        throw new BadRequestException('Either (month, year) or (startDate, endDate) must be provided');
    }

    @ApiOperation({ summary: 'Get Calendar Stats', description: 'Get counts of working days and holidays.' })
    @Get('stats')
    async getStats(
        @Req() req,
        @Query('startDate') startDate: string,
        @Query('endDate') endDate: string,
        @Query('classId') classId?: number,
    ) {
        return this.service.getStats(
            req.user.schoolId,
            startDate,
            endDate,
            classId ? Number(classId) : undefined
        );
    }

    @ApiOperation({ summary: 'Export iCal', description: 'Download calendar as .ics file.' })
    @Get('export')
    async exportCalendar(
        @Req() req,
        @Query('startDate') startDate: string,
        @Query('endDate') endDate: string,
        @Query('classId') classId?: number,
    ) {
        const calendar = await this.service.generateCalendar(
            req.user.schoolId,
            startDate,
            endDate,
            classId ? Number(classId) : undefined
        );

        // Simple ICS Generation
        let ics = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Edulama//Calendar//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
        ];

        calendar.days.forEach(day => {
            if (day.type !== 'WORKING') {
                ics.push('BEGIN:VEVENT');
                ics.push(`DTSTART;VALUE=DATE:${day.date.replace(/-/g, '')}`);
                ics.push(`DTEND;VALUE=DATE:${day.date.replace(/-/g, '')}`);
                ics.push(`SUMMARY:${day.title || day.type}`);
                ics.push('END:VEVENT');
            }
        });

        ics.push('END:VCALENDAR');

        // Return as string for now. In a real app, we'd set headers for file download.
        return ics.join('\r\n');
    }

    @ApiOperation({ summary: 'Validate Date', description: 'Check if a specific date is a working day.' })
    @Get('validate')
    validateDate(
        @Req() req,
        @Query('date') dateString: string
    ) {
        return this.service.validateDate(req.user.schoolId, new Date(dateString));
    }
}
