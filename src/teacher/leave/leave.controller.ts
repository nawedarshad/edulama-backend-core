import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, ParseIntPipe, Query, DefaultValuePipe } from '@nestjs/common';
import { TeacherLeaveService } from './leave.service';
import { ApplyLeaveDto } from './dto/apply-leave.dto';
import { UpdateLeaveDto } from './dto/update-leave.dto';
import { UserAuthGuard } from '../../common/guards/user.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';

import { RequiredModule } from '../../common/decorators/required-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';

@ApiTags('Teacher Leave Management')
@ApiBearerAuth()
@Controller('teacher/leave')
@UseGuards(UserAuthGuard, ModuleGuard)
@RequiredModule('LEAVE_MANAGEMENT')
export class TeacherLeaveController {
    constructor(private readonly leaveService: TeacherLeaveService) { }

    @Post('apply')
    @ApiOperation({ summary: 'Apply for a new leave' })
    @ApiResponse({ status: 201, description: 'Leave request submitted successfully.' })
    applyLeave(@Request() req, @Body() dto: ApplyLeaveDto) {
        return this.leaveService.applyLeave(req.user, dto);
    }

    @Get()
    @ApiOperation({ summary: 'Get leave history' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    findAll(
        @Request() req,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number
    ) {
        return this.leaveService.findAll(req.user, page, limit);
    }

    @Get('stats')
    @ApiOperation({ summary: 'Get leave statistics' })
    getStats(@Request() req) {
        return this.leaveService.getStats(req.user);
    }

    @Get('types')
    @ApiOperation({ summary: 'Get available leave types' })
    getLeaveTypes(@Request() req) {
        return this.leaveService.getLeaveTypes(req.user.schoolId);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get specific leave request details' })
    findOne(@Request() req, @Param('id', ParseIntPipe) id: number) {
        return this.leaveService.findOne(req.user, id);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update a pending leave request' })
    update(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLeaveDto) {
        return this.leaveService.update(req.user, id, dto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Cancel a pending leave request' })
    cancel(@Request() req, @Param('id', ParseIntPipe) id: number) {
        return this.leaveService.cancel(req.user, id);
    }
}
