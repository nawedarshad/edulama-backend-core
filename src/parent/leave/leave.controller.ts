import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, ParseIntPipe, Query, DefaultValuePipe } from '@nestjs/common';
import { ParentLeaveService } from './leave.service';
import { ApplyStudentLeaveDto } from './dto/apply-student-leave.dto';
import { UpdateStudentLeaveDto } from './dto/update-student-leave.dto';
import { UserAuthGuard } from '../../common/guards/user.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';

@ApiTags('Parent - Student Leave')
@ApiBearerAuth()
@Controller('parent/student-leave')
@UseGuards(UserAuthGuard)
export class ParentLeaveController {
    constructor(private readonly leaveService: ParentLeaveService) { }

    @Post()
    @ApiOperation({ summary: 'Apply for student leave (parent)' })
    @ApiResponse({ status: 201, description: 'Leave request created successfully' })
    @ApiResponse({ status: 400, description: 'Invalid request or overlapping leave' })
    @ApiResponse({ status: 403, description: 'Not authorized to apply for this student' })
    applyLeave(@Request() req, @Body() dto: ApplyStudentLeaveDto) {
        return this.leaveService.applyLeave(req.user, dto);
    }

    @Get()
    @ApiOperation({ summary: 'Get all leave requests for parent\'s children' })
    @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
    @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
    @ApiResponse({ status: 200, description: 'List of leave requests with pagination' })
    findAll(
        @Request() req,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number
    ) {
        return this.leaveService.findAll(req.user, page, limit);
    }

    @Get('types')
    @ApiOperation({ summary: 'Get available student leave types' })
    @ApiResponse({ status: 200, description: 'List of active student leave types' })
    getLeaveTypes(@Request() req) {
        return this.leaveService.getLeaveTypes(req.user.schoolId);
    }

    @Get('stats/:studentId')
    @ApiOperation({ summary: 'Get leave statistics for a specific student' })
    @ApiParam({ name: 'studentId', type: Number, description: 'Student ID' })
    @ApiResponse({ status: 200, description: 'Leave statistics for the student' })
    @ApiResponse({ status: 403, description: 'Not authorized to view this student\'s data' })
    getStats(@Request() req, @Param('studentId', ParseIntPipe) studentId: number) {
        return this.leaveService.getStats(req.user, studentId);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get specific leave request details' })
    @ApiParam({ name: 'id', type: Number, description: 'Leave request ID' })
    @ApiResponse({ status: 200, description: 'Leave request details' })
    @ApiResponse({ status: 404, description: 'Leave request not found' })
    findOne(@Request() req, @Param('id', ParseIntPipe) id: number) {
        return this.leaveService.findOne(req.user, id);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update pending leave request' })
    @ApiParam({ name: 'id', type: Number, description: 'Leave request ID' })
    @ApiResponse({ status: 200, description: 'Leave request updated successfully' })
    @ApiResponse({ status: 400, description: 'Only pending requests can be edited' })
    update(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStudentLeaveDto) {
        return this.leaveService.update(req.user, id, dto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Cancel pending leave request' })
    @ApiParam({ name: 'id', type: Number, description: 'Leave request ID' })
    @ApiResponse({ status: 200, description: 'Leave request cancelled successfully' })
    @ApiResponse({ status: 400, description: 'Only pending requests can be cancelled' })
    cancel(@Request() req, @Param('id', ParseIntPipe) id: number) {
        return this.leaveService.cancel(req.user, id);
    }
}
