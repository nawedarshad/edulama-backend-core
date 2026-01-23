import { Controller, Get, Query, UseGuards, UnauthorizedException } from '@nestjs/common';
import { CalendarService } from 'src/principal/calendar/calendar.service';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { UserAuthGuard } from 'src/common/guards/user.guard';
import { GetCalendarDto } from 'src/principal/calendar/dto/calendar.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@UseGuards(UserAuthGuard)
@Controller('student/calendar')
export class StudentCalendarController {
    constructor(
        private calendarService: CalendarService,
        private prisma: PrismaService
    ) { }

    @Get()
    async getCalendar(
        @GetUser() user: any,
        @Query() dto: GetCalendarDto,
    ) {
        const student = await this.prisma.studentProfile.findFirst({
            where: { schoolId: user.schoolId, userId: user.id },
            select: { classId: true }
        });

        if (!student) {
            throw new UnauthorizedException('Student profile not found');
        }

        return this.calendarService.generateCalendar(user.schoolId, dto.startDate, dto.endDate, student.classId, user.academicYearId);
    }
}
