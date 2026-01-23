import { Controller, Get, Patch, Param, Body, UseGuards, Request, ParseIntPipe, Query, DefaultValuePipe } from '@nestjs/common';
import { StudentLeaveApprovalService } from './student-leave-approval.service';
import { ClassTeacherActionDto } from './dto/class-teacher-action.dto';
import { UserAuthGuard } from '../../common/guards/user.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';

@ApiTags('Teacher - Student Leave Approval')
@ApiBearerAuth()
@Controller('teacher/student-leave-approvals')
@UseGuards(UserAuthGuard)
export class StudentLeaveApprovalController {
    constructor(private readonly approvalService: StudentLeaveApprovalService) { }

    @Get()
    @ApiOperation({ summary: 'Get pending student leave requests for class teacher\'s class' })
    @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
    @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
    @ApiResponse({ status: 200, description: 'List of pending leave requests' })
    findPendingLeaves(
        @Request() req,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number
    ) {
        return this.approvalService.findPendingLeaves(req.user, page, limit);
    }

    @Get('stats')
    @ApiOperation({ summary: 'Get approval statistics for class teacher' })
    @ApiResponse({ status: 200, description: 'Approval statistics' })
    getStats(@Request() req) {
        return this.approvalService.getStats(req.user);
    }

    @Get('history')
    @ApiOperation({ summary: 'Get history of processed leave requests' })
    @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
    @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
    @ApiResponse({ status: 200, description: 'List of processed leave requests' })
    findHistory(
        @Request() req,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number
    ) {
        return this.approvalService.findHistory(req.user, page, limit);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get specific leave request details' })
    @ApiParam({ name: 'id', type: Number, description: 'Leave request ID' })
    @ApiResponse({ status: 200, description: 'Leave request details' })
    @ApiResponse({ status: 404, description: 'Leave request not found' })
    @ApiResponse({ status: 403, description: 'Not authorized to view this leave' })
    findOne(@Request() req, @Param('id', ParseIntPipe) id: number) {
        return this.approvalService.findOne(req.user, id);
    }

    @Patch(':id/action')
    @ApiOperation({ summary: 'Approve or reject student leave request' })
    @ApiParam({ name: 'id', type: Number, description: 'Leave request ID' })
    @ApiResponse({ status: 200, description: 'Leave action processed successfully' })
    @ApiResponse({ status: 400, description: 'Invalid action or leave already processed' })
    @ApiResponse({ status: 403, description: 'Not authorized to approve this leave' })
    takeAction(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() dto: ClassTeacherActionDto) {
        return this.approvalService.takeAction(req.user, id, dto);
    }
}
