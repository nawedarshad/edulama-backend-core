import { Body, Controller, Get, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { CreateAttendanceSessionDto } from './dto/create-attendance-session.dto';
import { UpdateAttendanceSettingsDto } from './dto/update-attendance-settings.dto';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequiredModule } from '../../common/decorators/required-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';

@ApiTags('Principal - Attendance')
@ApiBearerAuth()
@Controller('principal/attendance')
@UseGuards(PrincipalAuthGuard, ModuleGuard)
@RequiredModule('ATTENDANCE')
export class AttendanceController {
    constructor(private readonly attendanceService: AttendanceService) { }

    @ApiOperation({ summary: 'Create Attendance Session', description: 'Initialize an attendance session. Enforces School Attendance Mode (DAILY vs PERIOD_WISE).' })
    @Post('session')
    createSession(@Request() req, @Body() dto: CreateAttendanceSessionDto) {
        const schoolId = req.user.schoolId;
        const userId = req.user.id;
        return this.attendanceService.createSession(schoolId, userId, dto);
    }

    @ApiOperation({ summary: 'Get Attendance Sessions', description: 'List recent attendance sessions' })
    @Get('sessions')
    getSessions(@Request() req, @Query('date') date?: string) {
        const schoolId = req.user.schoolId;
        return this.attendanceService.getSessions(schoolId, date);
    }

    @ApiOperation({ summary: 'Get Attendance Settings', description: 'Retrieve school-wide attendance configurations.' })
    @Get('settings')
    getSettings(@Request() req) {
        const schoolId = req.user.schoolId;
        return this.attendanceService.getSettings(schoolId);
    }

    @ApiOperation({ summary: 'Update Attendance Settings', description: 'Update school-wide attendance configurations (Mode, Late Threshold, etc).' })
    @Patch('settings')
    updateSettings(@Request() req, @Body() dto: UpdateAttendanceSettingsDto) {
        const schoolId = req.user.schoolId;
        const userId = req.user.id;
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
        return this.attendanceService.updateSettings(schoolId, userId, dto, ip);
    }
}
