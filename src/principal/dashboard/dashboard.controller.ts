import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiResponse } from '@nestjs/swagger';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { DashboardService } from './dashboard.service';

@ApiTags('Principal - Dashboard')
@ApiBearerAuth()
@Controller('principal/dashboard')
@UseGuards(PrincipalAuthGuard)
export class DashboardController {
    constructor(private readonly dashboardService: DashboardService) { }

    @ApiOperation({ summary: 'Get Dashboard Statistics' })
    @ApiResponse({ status: 200, description: 'Returns dashboard stats.' })
    @Get()
    getStats(@Request() req) {
        return this.dashboardService.getStats(req.user.schoolId);
    }
}
