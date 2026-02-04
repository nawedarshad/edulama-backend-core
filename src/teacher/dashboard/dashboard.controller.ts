import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { PrincipalOrTeacherGuard } from '../../common/guards/principal-teacher.guard';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Teacher Dashboard')
@Controller('teacher/dashboard')
@UseGuards(PrincipalOrTeacherGuard)
export class DashboardController {
    constructor(private readonly dashboardService: DashboardService) { }

    @ApiOperation({ summary: 'Get Dashboard Statistics' })
    @Get('stats')
    async getStats(@Request() req) {
        return this.dashboardService.getDashboardStats(req.user.schoolId, req.user.id);
    }
}
