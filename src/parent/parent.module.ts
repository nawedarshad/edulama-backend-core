import { Module } from '@nestjs/common';
import { ParentLeaveModule } from './leave/leave.module';
import { ParentTimetableModule } from './timetable/parent-timetable.module';
import { ParentClassDiaryModule } from './diary/parent-class-diary.module';
import { ParentNoticeModule } from './notice/parent-notice.module';
import { ParentController } from './parent.controller';
import { ParentService } from './parent.service';
import { PrismaModule } from '../prisma/prisma.module';
import { HttpModule } from '@nestjs/axios';
import { CalendarModule } from 'src/principal/calendar/calendar.module';
import { ParentCalendarController } from './calendar/parent-calendar.controller';
import { ConfigModule } from '@nestjs/config';
import { ParentAnnouncementModule } from './announcement/parent-announcement.module';
import { ParentSubjectModule } from './subject/parent-subject.module';
import { ParentHomeworkModule } from './homework/parent-homework.module';
import { ParentDashboardModule } from './dashboard/parent-dashboard.module';
import { ParentAttendanceModule } from './attendance/parent-attendance.module';

@Module({
    imports: [
        PrismaModule,
        HttpModule,
        ConfigModule,
        ParentLeaveModule,
        ParentTimetableModule,
        ParentClassDiaryModule,
        ParentNoticeModule,
        ParentAnnouncementModule,
        ParentSubjectModule,
        ParentHomeworkModule,
        ParentDashboardModule,
        CalendarModule,
        ParentAttendanceModule,
    ],
    controllers: [ParentController, ParentCalendarController],
    providers: [ParentService],
})
export class ParentModule { }
