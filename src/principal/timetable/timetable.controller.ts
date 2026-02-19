import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import { PrincipalAuthGuard } from 'src/common/guards/principal.guard';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { TimetableService } from './timetable.service';
import { CreateTimePeriodDto } from './dto/create-time-period.dto';
import { CreateTimetableEntryDto } from './dto/create-timetable-entry.dto';
import { DayOfWeek } from '@prisma/client';

import { RequiredModule } from '../../common/decorators/required-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';

@ApiTags('Principal - Timetable')
@ApiBearerAuth()
@UseGuards(PrincipalAuthGuard, ModuleGuard)
@RequiredModule('TIMETABLE')
@Controller('principal/timetable')
export class TimetableController {
    constructor(private readonly timetableService: TimetableService) { }

    // ----------------------------------------------------------------
    // ----------------------------------------------------------------
    // ACADEMIC YEAR ACTIONS
    // ----------------------------------------------------------------

    @Post('copy-from-year')
    @ApiOperation({ summary: 'Copy timetable structure from a previous year', description: 'Copies periods and time slots from a source academic year to the current one.' })
    @ApiBody({ schema: { type: 'object', properties: { fromYearId: { type: 'number' } } } })
    @ApiResponse({ status: 201, description: 'Structure copied successfully.' })
    @ApiResponse({ status: 404, description: 'Source year or periods not found.' })
    @ApiResponse({ status: 409, description: 'Target year is locked or conflict exists.' })
    copyFromYear(
        @GetUser('schoolId') schoolId: number,
        @GetUser('academicYearId') academicYearId: number,
        @Body('fromYearId', ParseIntPipe) fromYearId: number,
    ) {
        return this.timetableService.copyTimetableStructure(schoolId, fromYearId, academicYearId);
    }

    // ----------------------------------------------------------------
    // TIME PERIODS
    // ----------------------------------------------------------------

    @Post('periods')
    @ApiOperation({ summary: 'Create a new Time Period', description: 'Creates a time slot definition (e.g., Period 1, Lunch) for a specific schedule.' })
    @ApiResponse({ status: 201, description: 'Period created successfully.' })
    @ApiResponse({ status: 400, description: 'Invalid schedule ID or time format.' })
    @ApiResponse({ status: 409, description: 'Period overlap or name duplicate detected.' })
    createPeriod(
        @GetUser('schoolId') schoolId: number,
        @GetUser('academicYearId') academicYearId: number,
        @Body() dto: CreateTimePeriodDto,
    ) {
        return this.timetableService.createTimePeriod(schoolId, academicYearId, dto);
    }

    @Get('periods')
    @ApiOperation({ summary: 'Get all time periods', description: 'Retrieves all time periods configured for the current academic year.' })
    @ApiResponse({ status: 200, description: 'List of time periods with their slots.' })
    findAllPeriods(
        @GetUser('schoolId') schoolId: number,
        @GetUser('academicYearId') academicYearId: number,
    ) {
        return this.timetableService.findAllTimePeriods(schoolId, academicYearId);
    }

    @Put('periods/:id')
    @ApiOperation({ summary: 'Update a time period', description: 'Updates timing, name, or days for an existing period with overlap validation.' })
    @ApiParam({ name: 'id', description: 'Time Period ID' })
    @ApiResponse({ status: 200, description: 'Period updated successfully.' })
    @ApiResponse({ status: 409, description: 'New time overlaps with existing period.' })
    updatePeriod(
        @GetUser('schoolId') schoolId: number,
        @GetUser('academicYearId') academicYearId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: CreateTimePeriodDto,
    ) {
        return this.timetableService.updateTimePeriod(schoolId, academicYearId, id, dto);
    }

    @Delete('periods/:id')
    @ApiOperation({ summary: 'Delete a time period', description: 'Removes a time period configuration.' })
    @ApiParam({ name: 'id', description: 'Time Period ID' })
    @ApiResponse({ status: 200, description: 'Period deleted successfully.' })
    deletePeriod(
        @GetUser('schoolId') schoolId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.timetableService.deleteTimePeriod(schoolId, id);
    }

    // ----------------------------------------------------------------
    // TIMETABLE ENTRIES
    // ----------------------------------------------------------------

    @Post('entries')
    @ApiOperation({ summary: 'Assign a subject to a slot (Create Entry)', description: 'Creates a timetable entry mapping class, subject, teacher, and room to a time slot.' })
    @ApiResponse({ status: 201, description: 'Entry created successfully.' })
    @ApiResponse({ status: 400, description: 'Locked year or invalid slot.' })
    @ApiResponse({ status: 409, description: 'Conflict: Teacher, Section, or Room already booked.' })
    createEntry(
        @GetUser('schoolId') schoolId: number,
        @GetUser('academicYearId') academicYearId: number,
        @Body() dto: CreateTimetableEntryDto,
    ) {
        return this.timetableService.createEntry(schoolId, academicYearId, dto);
    }

    @Delete('entries/:id')
    @ApiOperation({ summary: 'Remove a timetable entry', description: 'Deletes a scheduled class. Prevents deletion if entry is Locked.' })
    @ApiParam({ name: 'id', description: 'Timetable Entry ID' })
    @ApiResponse({ status: 200, description: 'Entry deleted successfully.' })
    @ApiResponse({ status: 400, description: 'Cannot delete locked entry.' })
    deleteEntry(
        @GetUser('schoolId') schoolId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.timetableService.deleteEntry(schoolId, id);
    }

    @Get('entries/section/:sectionId')
    @ApiOperation({ summary: 'Get timetable for a section', description: 'Retrieves the complete weekly schedule for a specific class section.' })
    @ApiParam({ name: 'sectionId', description: 'Section ID' })
    @ApiResponse({ status: 200, description: 'List of entries with detailed teacher and subject info.' })
    getForSection(
        @GetUser('schoolId') schoolId: number,
        @GetUser('academicYearId') academicYearId: number,
        @Param('sectionId', ParseIntPipe) sectionId: number,
    ) {
        return this.timetableService.getTimetableForSection(
            schoolId,
            academicYearId,
            sectionId,
        );
    }

    @Get('entries/teacher/:teacherId')
    @ApiOperation({ summary: 'Get timetable for a teacher', description: 'Retrieves the complete weekly teaching schedule for a specific teacher.' })
    @ApiParam({ name: 'teacherId', description: 'Teacher Profile ID' })
    @ApiResponse({ status: 200, description: 'List of teaching assignments.' })
    getForTeacher(
        @GetUser('schoolId') schoolId: number,
        @GetUser('academicYearId') academicYearId: number,
        @Param('teacherId', ParseIntPipe) teacherId: number,
    ) {
        return this.timetableService.getTimetableForTeacher(
            schoolId,
            academicYearId,
            teacherId,
        );
    }

    @Get('entries/room/:roomId')
    @ApiOperation({ summary: 'Get timetable for a room', description: 'Retrieves the booking schedule for a specific room.' })
    @ApiParam({ name: 'roomId', description: 'Room ID' })
    @ApiResponse({ status: 200, description: 'List of room bookings.' })
    getForRoom(
        @GetUser('schoolId') schoolId: number,
        @GetUser('academicYearId') academicYearId: number,
        @Param('roomId', ParseIntPipe) roomId: number,
    ) {
        return this.timetableService.getTimetableForRoom(
            schoolId,
            academicYearId,
            roomId,
        );
    }

    @Get('analytics')
    @ApiOperation({ summary: 'Get comprehensive timetable analytics data', description: 'Returns consolidated stats including teacher workload, room utilization, and subject distribution.' })
    @ApiResponse({ status: 200, description: 'Analytics object with summary statistics and detailed breakdown.' })
    getAnalytics(
        @GetUser('schoolId') schoolId: number,
        @GetUser('academicYearId') academicYearId: number,
    ) {
        return this.timetableService.getAnalyticsData(schoolId, academicYearId);
    }

    // ----------------------------------------------------------------
    // SMART & ANALYTICS
    // ----------------------------------------------------------------

    @Get('analytics/teacher-workload')
    @ApiOperation({ summary: 'Get teacher workload analysis', description: 'Returns period counts for all teachers to assess load balance.' })
    getTeacherWorkload(
        @GetUser('schoolId') schoolId: number,
        @GetUser('academicYearId') academicYearId: number,
    ) {
        return this.timetableService.getTeacherWorkloadAnalytics(
            schoolId,
            academicYearId,
        );
    }

    @Get('analytics/comprehensive')
    @ApiOperation({ summary: 'Get simplified comprehensive analytics', description: 'Alternative analytics endpoint for quick dashboard stats.' })
    getComprehensiveAnalytics(
        @GetUser('schoolId') schoolId: number,
        @GetUser('academicYearId') academicYearId: number,
    ) {
        return this.timetableService.getComprehensiveAnalytics(
            schoolId,
            academicYearId,
        );
    }

    @Get('analytics/class-distribution/:classId/:sectionId')
    @ApiOperation({ summary: 'Get subject distribution for a section', description: 'Shows how many periods are assigned to each subject for a class.' })
    getClassDistribution(
        @GetUser('schoolId') schoolId: number,
        @GetUser('academicYearId') academicYearId: number,
        @Param('classId', ParseIntPipe) classId: number,
        @Param('sectionId', ParseIntPipe) sectionId: number,
    ) {
        return this.timetableService.getClassSubjectDistribution(
            schoolId,
            academicYearId,
            classId,
            sectionId,
        );
    }

    @Get('find-free-teachers')
    @ApiOperation({ summary: 'Find available teachers', description: 'Finds teachers who are not teaching during a specific day and period.' })
    @ApiQuery({ name: 'day', enum: DayOfWeek })
    @ApiQuery({ name: 'periodId', type: Number })
    @ApiQuery({ name: 'subjectId', required: false, type: Number, description: 'Filter by preferred subject expertise' })
    findFreeTeachers(
        @GetUser('schoolId') schoolId: number,
        @GetUser('academicYearId') academicYearId: number,
        @Query('day') day: DayOfWeek,
        @Query('periodId', ParseIntPipe) periodId: number,
        @Query('subjectId') subjectId?: string,
    ) {
        const subId = subjectId ? parseInt(subjectId) : undefined;
        return this.timetableService.findFreeTeachers(
            schoolId,
            academicYearId,
            day,
            periodId,
            subId,
        );
    }

    @Get('find-free-rooms')
    @ApiOperation({ summary: 'Find available rooms', description: 'Finds rooms that are not booked during a specific day and period.' })
    @ApiQuery({ name: 'day', enum: DayOfWeek })
    @ApiQuery({ name: 'periodId', type: Number })
    findFreeRooms(
        @GetUser('schoolId') schoolId: number,
        @GetUser('academicYearId') academicYearId: number,
        @Query('day') day: DayOfWeek,
        @Query('periodId', ParseIntPipe) periodId: number,
    ) {
        return this.timetableService.findFreeRooms(
            schoolId,
            academicYearId,
            day,
            periodId,
        );
    }

    @Post('check-availability')
    @ApiOperation({ summary: 'Dry run check for conflicts', description: 'Checks if an entry can be created without actually creating it. Useful for UI feedback.' })
    @ApiResponse({ status: 201, description: 'Status object returning OK or CONFLICT with message.' })
    checkAvailability(
        @GetUser('schoolId') schoolId: number,
        @GetUser('academicYearId') academicYearId: number,
        @Body() dto: CreateTimetableEntryDto,
    ) {
        return this.timetableService.checkAvailability(
            schoolId,
            academicYearId,
            dto,
        );
    }

    @Get('context/:classId/:sectionId')
    @ApiOperation({ summary: 'Get full context for timetable grid', description: 'Fetches everything needed to render the timetable grid: period structure, existing entries, subject allocations, and available rooms.' })
    @ApiResponse({ status: 200, description: 'Complex object containing calendar structure, subjects, assignments, and schedule configuration.' })
    getContext(
        @GetUser('schoolId') schoolId: number,
        @GetUser('academicYearId') academicYearId: number,
        @Param('classId', ParseIntPipe) classId: number,
        @Param('sectionId', ParseIntPipe) sectionId: number,
    ) {
        return this.timetableService.getTimetableContext(
            schoolId,
            academicYearId,
            classId,
            sectionId,
        );
    }
}
