import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DayOfWeek } from '@prisma/client';
import { TimeSlotService } from './time-slot.service';
import { CreateTimeSlotDto } from './dto/create-time-slot.dto';
import { UpdateTimeSlotDto } from './dto/update-time-slot.dto';
import { PrincipalAuthGuard } from '../../../common/guards/principal.guard';

@ApiTags('Principal - Global Time Slots')
@UseGuards(PrincipalAuthGuard)
@Controller('principal/global/timeslots')
export class TimeSlotController {
    constructor(private readonly timeSlotService: TimeSlotService) { }

    @ApiOperation({ summary: 'Create Time Slot', description: 'Define a specific period for a day.' })
    @Post()
    create(@Request() req, @Body() dto: CreateTimeSlotDto) {
        return this.timeSlotService.create(req.user.schoolId, dto);
    }

    @ApiOperation({ summary: 'List Time Slots', description: 'Get slots for all days or a specific day.' })
    @Get()
    findAll(@Request() req, @Query('day') day?: DayOfWeek) {
        return this.timeSlotService.findAll(req.user.schoolId, day);
    }

    @ApiOperation({ summary: 'Get Time Slot', description: 'Get details of a single slot.' })
    @Get(':id')
    findOne(@Request() req, @Param('id', ParseIntPipe) id: number) {
        return this.timeSlotService.findOne(req.user.schoolId, id);
    }

    @ApiOperation({ summary: 'Update Time Slot', description: 'Modify period or day of a slot.' })
    @Patch(':id')
    update(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTimeSlotDto) {
        return this.timeSlotService.update(req.user.schoolId, id, dto);
    }

    @ApiOperation({ summary: 'Delete Time Slot', description: 'Remove a slot.' })
    @Delete(':id')
    remove(@Request() req, @Param('id', ParseIntPipe) id: number) {
        return this.timeSlotService.remove(req.user.schoolId, id);
    }
}
