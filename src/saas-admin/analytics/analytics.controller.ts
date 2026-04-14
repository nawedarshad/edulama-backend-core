import { Controller, Get, Query, UseGuards, ParseIntPipe, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AdminAuthGuard } from '../../common/guards/admin.guard';
import { AnalyticsService } from './analytics.service';

@ApiTags('SaaS Admin - Analytics')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/analytics')
export class AnalyticsController {
    constructor(private readonly analyticsService: AnalyticsService) { }

    @Get('overview')
    @ApiOperation({ summary: 'Get platform overview stats', description: 'Returns high-level statistics about schools, users, and demographics with optional date filtering.' })
    @ApiQuery({ name: 'startDate', required: false, type: String, description: 'ISO date string' })
    @ApiQuery({ name: 'endDate', required: false, type: String, description: 'ISO date string' })
    async getOverview(
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string
    ) {
        return this.analyticsService.getOverviewStats(
            startDate ? new Date(startDate) : undefined,
            endDate ? new Date(endDate) : undefined
        );
    }

    @Get('history')
    @ApiOperation({ summary: 'Get historical growth data', description: 'Returns time-series data for schools or students over a specified number of months.' })
    @ApiQuery({ name: 'type', enum: ['schools', 'students'], required: true })
    @ApiQuery({ name: 'months', required: false, type: Number, description: 'Number of months to look back (default 6)' })
    async getHistory(
        @Query('type') type: 'schools' | 'students',
        @Query('months') months?: string
    ) {
        return this.analyticsService.getHistoricalData(type, months ? parseInt(months) : 6);
    }

    @Get('activity')
    @ApiOperation({ summary: 'Get platform-wide activity logs', description: 'Returns a list of the most recent audit logs across all schools.' })
    @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of logs to return (default 10)' })
    async getActivity(@Query('limit') limit?: string) {
        return this.analyticsService.getActivityStats(limit ? parseInt(limit) : 10);
    }

    @Get('modules')
    @ApiOperation({ summary: 'Get module adoption stats', description: 'Returns a list of all modules and how many schools have them enabled/installed.' })
    async getModules() {
        return this.analyticsService.getModuleStats();
    }

    @Get('health')
    @ApiOperation({ summary: 'Get system health metrics', description: 'Returns server uptime, memory usage, and platform details.' })
    getHealth() {
        return this.analyticsService.getSystemHealth();
    }
}
