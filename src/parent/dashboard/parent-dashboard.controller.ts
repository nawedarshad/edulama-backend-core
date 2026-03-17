import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserAuthGuard } from '../../common/guards/user.guard';
import { ParentDashboardService } from './parent-dashboard.service';

@ApiTags('Parent - Dashboard')
@ApiBearerAuth()
@Controller('parent/dashboard')
@UseGuards(UserAuthGuard)
export class ParentDashboardController {
    constructor(private readonly dashboardService: ParentDashboardService) { }

    @ApiOperation({ summary: 'Get Dashboard Statistics for a child' })
    @Get('stats/:studentId')
    async getStats(@Request() req, @Param('studentId') studentId: string) {
        return this.dashboardService.getDashboardStats(
            req.user.schoolId, 
            req.user.id, 
            parseInt(studentId)
        );
    }
}
