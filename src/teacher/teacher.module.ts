import { Module } from '@nestjs/common';
import { TeacherStudentModule } from './student/student.module';
import { TeacherClassModule } from './class/class.module';
import { TeacherSectionModule } from './section/section.module';
import { TeacherAttendanceModule } from './attendance/attendance.module';
import { TeacherLeaveModule } from './leave/leave.module';
import { StudentLeaveApprovalModule } from './student-leave-approval/student-leave-approval.module';
import { TeacherTimetableModule } from './timetable/teacher-timetable.module';
import { TeacherLessonModule } from './lesson/teacher-lesson.module';
import { TeacherNoticeModule } from './notice/teacher-notice.module';
import { TeacherSubjectModule } from './subject/teacher-subject.module';
import { CalendarModule } from 'src/principal/calendar/calendar.module';
import { TeacherCalendarController } from './calendar/teacher-calendar.controller';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TeacherAnnouncementModule } from './announcement/teacher-announcement.module';
import { TeacherProfileModule } from './profile/teacher-profile.module';

import { DashboardModule } from './dashboard/dashboard.module';

@Module({
    imports: [
        TeacherStudentModule,
        TeacherClassModule,
        TeacherSectionModule,
        TeacherAttendanceModule,
        TeacherLeaveModule,
        StudentLeaveApprovalModule,
        TeacherTimetableModule,
        TeacherLessonModule,
        TeacherNoticeModule,
        TeacherSubjectModule,
        CalendarModule,
        HttpModule,
        ConfigModule,
        TeacherAnnouncementModule,
        TeacherProfileModule,
        DashboardModule,
    ],
    controllers: [TeacherCalendarController],
})
export class TeacherModule { }
