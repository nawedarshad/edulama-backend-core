import { Controller, Get, Patch, Query, Param, Body, UseGuards, Request, ParseIntPipe } from '@nestjs/common';
import { PrincipalLeaveService } from './leave.service';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { UserAuthGuard } from '../../common/guards/user.guard';
import { LeaveActionDto } from './dto/leave-action.dto';

@Controller('principal/leave-requests')
@UseGuards(UserAuthGuard)
// @UseGuards(PrincipalAuthGuard) // Enable in prod
export class PrincipalLeaveController {
    constructor(private readonly leaveService: PrincipalLeaveService) { }

    @Get()
    findAll(@Request() req, @Query() query: any) {
        return this.leaveService.findAll(req.user.schoolId, query);
    }

    // IMPORTANT: Specific routes MUST come before parameterized routes
    @Get('teacher-summary')
    getTeacherLeaveSummary(@Request() req) {
        return this.leaveService.getTeacherLeaveSummary(req.user.schoolId, req.user.academicYearId);
    }

    // Parameterized routes come AFTER specific routes
    @Get(':id')
    findOne(@Request() req, @Param('id', ParseIntPipe) id: number) {
        return this.leaveService.findOne(req.user.schoolId, id);
    }

    @Patch(':id/action')
    action(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() dto: LeaveActionDto) {
        return this.leaveService.action(req.user, id, dto);
    }
}
