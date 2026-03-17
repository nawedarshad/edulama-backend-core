import { Controller, Get, Query, UseGuards, Request, Param, ParseIntPipe, UnauthorizedException } from '@nestjs/common';
import { ParentAttendanceService } from './parent-attendance.service.js';
import { UserAuthGuard } from '../../common/guards/user.guard';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service.js';

@ApiTags('Parent - Attendance')
@ApiBearerAuth()
@UseGuards(UserAuthGuard)
@Controller('parent/attendance')
export class ParentAttendanceController {
    constructor(
        private readonly attendanceService: ParentAttendanceService,
        private readonly prisma: PrismaService
    ) { }

    @ApiOperation({ summary: 'Get child attendance for a month' })
    @Get(':studentId')
    async getChildAttendance(
        @Request() req,
        @Param('studentId', ParseIntPipe) studentId: number,
        @Query('month') month: number,
        @Query('year') year: number,
    ) {
        // Verify Parent-Student Link
        const link = await this.prisma.parentStudent.findFirst({
            where: {
                parent: { userId: req.user.id },
                studentId: studentId,
            }
        });

        if (!link) {
            throw new UnauthorizedException('Student not found or not linked to this parent');
        }

        return this.attendanceService.getStudentAttendance(studentId, req.user.schoolId, month, year);
    }
}
