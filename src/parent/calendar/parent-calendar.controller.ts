import { Controller, Get, Query, UseGuards, UnauthorizedException, BadRequestException, ParseIntPipe, Param } from '@nestjs/common';
import { CalendarService } from 'src/principal/calendar/calendar.service';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { UserAuthGuard } from 'src/common/guards/user.guard';
import { GetCalendarDto } from 'src/principal/calendar/dto/calendar.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@UseGuards(UserAuthGuard)
@Controller('parent/calendar')
export class ParentCalendarController {
    constructor(
        private calendarService: CalendarService,
        private prisma: PrismaService
    ) { }

    @Get(':studentId')
    async getCalendar(
        @GetUser() user: any,
        @Param('studentId', ParseIntPipe) studentId: number,
        @Query() dto: GetCalendarDto,
    ) {
        if (!studentId) {
            throw new BadRequestException('studentId is required');
        }

        // Verify Parent-Student Link
        const link = await this.prisma.parentStudent.findFirst({
            where: {
                parent: { userId: user.id },
                studentId: studentId,
                student: { schoolId: user.schoolId }
            },
            include: { student: { select: { classId: true } } }
        });

        if (!link) {
            throw new UnauthorizedException('Student not found or not linked to this parent');
        }

        return this.calendarService.generateCalendar(user.schoolId, dto.startDate, dto.endDate, link.student.classId, user.academicYearId);
    }

    @Get('validate-date/:studentId')
    async validateDate(
        @GetUser() user: any,
        @Param('studentId', ParseIntPipe) studentId: number,
        @Query('date') date: string,
    ) {
        // Verify Parent-Student Link
        const link = await this.prisma.parentStudent.findFirst({
            where: {
                parent: { userId: user.id },
                studentId: studentId,
                student: { schoolId: user.schoolId }
            },
            include: { student: { select: { classId: true } } }
        });

        if (!link) {
            throw new UnauthorizedException('Student not found or not linked to this parent');
        }

        return this.calendarService.validateDate(user.schoolId, new Date(date));
    }
}
