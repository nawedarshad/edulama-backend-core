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

@Module({
    imports: [
        PrismaModule,
        HttpModule,
        ParentLeaveModule,
        ParentTimetableModule,
        ParentClassDiaryModule,
        ParentNoticeModule,
        CalendarModule,
    ],
    controllers: [ParentController, ParentCalendarController],
    providers: [ParentService],
})
export class ParentModule { }
