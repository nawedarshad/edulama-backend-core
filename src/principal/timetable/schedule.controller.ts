import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    ParseIntPipe,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, ApiParam, ApiBody } from '@nestjs/swagger';
import { PrincipalAuthGuard } from 'src/common/guards/principal.guard';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { ScheduleService } from './schedule.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';

@ApiTags('Principal - Timetable - Schedules')
@ApiBearerAuth()
@UseGuards(PrincipalAuthGuard)
@Controller('principal/timetable/schedules')
export class ScheduleController {
    constructor(private readonly scheduleService: ScheduleService) { }

    @Post()
    @ApiOperation({ summary: 'Create a new bell schedule', description: 'Creates a uniquely named bell schedule (e.g., "Regular Schedule", "Exam Schedule").' })
    @ApiResponse({ status: 201, description: 'Schedule created successfully.' })
    @ApiResponse({ status: 409, description: 'Schedule name already exists.' })
    createSchedule(
        @GetUser('schoolId') schoolId: number,
        @GetUser('academicYearId') academicYearId: number,
        @Body() dto: CreateScheduleDto,
    ) {
        return this.scheduleService.createSchedule(schoolId, academicYearId, dto);
    }

    @Get()
    @ApiOperation({ summary: 'Get all schedules', description: 'Retrieves all configured bell schedules for the current academic year.' })
    @ApiResponse({ status: 200, description: 'List of schedules.' })
    findAllSchedules(
        @GetUser('schoolId') schoolId: number,
        @GetUser('academicYearId') academicYearId: number,
    ) {
        return this.scheduleService.findAllSchedules(schoolId, academicYearId);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a schedule', description: 'Retrieves a specific schedule along with its time periods.' })
    @ApiParam({ name: 'id', description: 'Schedule ID' })
    @ApiResponse({ status: 200, description: 'Schedule details.' })
    findOne(
        @GetUser('schoolId') schoolId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.scheduleService.findOne(schoolId, id);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update a schedule', description: 'Updates the name or description of an existing schedule.' })
    @ApiParam({ name: 'id', description: 'Schedule ID' })
    @ApiResponse({ status: 200, description: 'Schedule updated.' })
    updateSchedule(
        @GetUser('schoolId') schoolId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateScheduleDto,
    ) {
        return this.scheduleService.updateSchedule(schoolId, id, dto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a schedule', description: 'Deletes a schedule configuration. Cannot delete if assigned to classes.' })
    @ApiParam({ name: 'id', description: 'Schedule ID' })
    @ApiResponse({ status: 200, description: 'Schedule deleted.' })
    @ApiResponse({ status: 400, description: 'Cannot delete schedule in use by classes.' })
    deleteSchedule(
        @GetUser('schoolId') schoolId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.scheduleService.deleteSchedule(schoolId, id);
    }

    @Post(':id/set-default')
    @ApiOperation({ summary: 'Set default schedule', description: 'Marks this schedule as the default for the academic year. Sets all others to non-default.' })
    @ApiParam({ name: 'id', description: 'Schedule ID' })
    @ApiResponse({ status: 201, description: 'Default schedule updated.' })
    setAsDefault(
        @GetUser('schoolId') schoolId: number,
        @GetUser('academicYearId') academicYearId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.scheduleService.setAsDefault(schoolId, academicYearId, id);
    }

    @Post(':id/duplicate')
    @ApiOperation({ summary: 'Duplicate a schedule', description: 'Clones a schedule including all its time periods. Useful for creating variations like "Early Dismissal".' })
    @ApiParam({ name: 'id', description: 'Source Schedule ID' })
    @ApiBody({ schema: { type: 'object', properties: { newName: { type: 'string' } } } })
    @ApiResponse({ status: 201, description: 'Schedule duplicated successfully.' })
    duplicateSchedule(
        @GetUser('schoolId') schoolId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body('newName') newName: string,
    ) {
        return this.scheduleService.duplicateSchedule(schoolId, id, newName);
    }
}
