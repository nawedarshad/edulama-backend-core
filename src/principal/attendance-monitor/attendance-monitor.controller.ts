import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { CreateMonitorDto } from './dto/create-monitor.dto';
import { AttendanceMonitorService } from './attendance-monitor.service';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';

@Controller('principal/attendance/monitors')
@UseGuards(PrincipalAuthGuard)
export class AttendanceMonitorController {
    constructor(private readonly service: AttendanceMonitorService) { }

    @Post()
    assignMonitors(
        @Req() req,
        @Body() dto: CreateMonitorDto,
    ) {
        return this.service.assignMonitors(req.user.schoolId, req.user.academicYearId, dto.userIds);
    }

    @Get()
    getMonitors(@Req() req) {
        return this.service.getMonitors(req.user.schoolId, req.user.academicYearId);
    }

    @Delete(':teacherId')
    removeMonitor(
        @Req() req,
        @Param('teacherId', ParseIntPipe) teacherId: number,
    ) {
        return this.service.removeMonitor(req.user.schoolId, req.user.academicYearId, teacherId);
    }
}
