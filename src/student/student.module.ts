import { Module } from '@nestjs/common';
import { StudentTimetableModule } from './timetable/student-timetable.module';
import { StudentNoticeModule } from './notice/student-notice.module';
import { CalendarModule } from 'src/principal/calendar/calendar.module';
import { StudentCalendarController } from './calendar/student-calendar.controller';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { StudentProfileController } from './profile/student-profile.controller';
import { StudentProfileService } from './profile/student-profile.service';
import { StudentAnnouncementModule } from './announcement/student-announcement.module';
import { StudentSubjectModule } from './subject/student-subject.module';
import { StudentHomeworkModule } from './homework/student-homework.module';
import { StudentAttendanceModule } from './attendance/student-attendance.module';

@Module({
    imports: [
        StudentTimetableModule,
        StudentNoticeModule,
        StudentAnnouncementModule,
        StudentSubjectModule,
        StudentHomeworkModule,
        StudentAttendanceModule,
        CalendarModule,
        HttpModule,
        ConfigModule,
    ],
    controllers: [StudentCalendarController, StudentProfileController],
    providers: [StudentProfileService],
})
export class StudentModule { }
