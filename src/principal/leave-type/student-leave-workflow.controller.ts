import { Controller, Get, Patch, Param, Body, UseGuards, Request, ParseIntPipe, Post } from '@nestjs/common';
import { StudentLeaveWorkflowService } from './student-leave-workflow.service';
import { UpdateStudentLeaveWorkflowDto } from './dto/update-student-leave-workflow.dto';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';

@ApiTags('Student Leave Workflow Settings')
@ApiBearerAuth()
@Controller('principal/student-leave-workflows')
@UseGuards(PrincipalAuthGuard)
export class StudentLeaveWorkflowController {
    constructor(private readonly workflowService: StudentLeaveWorkflowService) { }

    @Get()
    @ApiOperation({ summary: 'Get all student leave types with their workflow settings' })
    @ApiResponse({ status: 200, description: 'List of student leave types with workflow configurations' })
    getAllWorkflows(@Request() req) {
        return this.workflowService.getAllStudentLeaveWorkflows(req.user.schoolId);
    }

    @Get(':leaveTypeId')
    @ApiOperation({ summary: 'Get workflow setting for a specific student leave type' })
    @ApiParam({ name: 'leaveTypeId', type: Number, description: 'Leave type ID' })
    @ApiResponse({ status: 200, description: 'Workflow setting for the leave type' })
    @ApiResponse({ status: 404, description: 'Leave type not found' })
    getWorkflow(@Request() req, @Param('leaveTypeId', ParseIntPipe) leaveTypeId: number) {
        return this.workflowService.getWorkflowForLeaveType(req.user.schoolId, leaveTypeId);
    }

    @Patch(':leaveTypeId')
    @ApiOperation({ summary: 'Update workflow setting for a specific student leave type' })
    @ApiParam({ name: 'leaveTypeId', type: Number, description: 'Leave type ID' })
    @ApiResponse({ status: 200, description: 'Workflow updated successfully' })
    @ApiResponse({ status: 400, description: 'Invalid request or not a student leave type' })
    @ApiResponse({ status: 404, description: 'Leave type not found' })
    updateWorkflow(
        @Request() req,
        @Param('leaveTypeId', ParseIntPipe) leaveTypeId: number,
        @Body() dto: UpdateStudentLeaveWorkflowDto
    ) {
        return this.workflowService.updateWorkflow(req.user.schoolId, leaveTypeId, dto);
    }

    @Post('bulk-update')
    @ApiOperation({ summary: 'Bulk update workflow settings for multiple leave types' })
    @ApiResponse({ status: 200, description: 'Bulk update completed with results' })
    bulkUpdateWorkflows(
        @Request() req,
        @Body() body: { updates: Array<{ leaveTypeId: number; workflow: string }> }
    ) {
        return this.workflowService.bulkUpdateWorkflows(req.user.schoolId, body.updates);
    }
}
