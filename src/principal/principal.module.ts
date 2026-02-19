import { Module } from '@nestjs/common';
import { RoomModule } from './room/room.module';
import { ClassModule } from './class/class.module';
import { SectionModule } from './section/section.module';
import { RoomAssignmentModule } from './room-assignment/room-assignment.module';
import { TeacherModule } from './teacher/teacher.module';
import { GlobalModule } from './global/global.module';

import { AcademicYearModule } from './academic-year/academic-year.module';
import { CalendarModule } from './calendar/calendar.module';
import { DepartmentModule } from './department/department.module';
import { SubjectModule } from './subject/subject.module';
import { StudentModule } from './student/student.module';
import { HouseModule } from './house/house.module';
import { GrievanceModule } from './grievance/grievance.module';
import { RoleModule } from './role/role.module';
import { TimetableModule } from './timetable/timetable.module';
import { AttendanceModule } from './attendance/attendance.module';
import { PrincipalLeaveTypeModule } from './leave-type/leave-type.module';

import { PrincipalAnnouncementModule } from './announcement/principal-announcement.module';
import { PrincipalNoticeModule } from './notice/principal-notice.module';
import { PrincipalDiaryModule } from './diary/principal-diary.module';
import { PrincipalLeaveModule } from './leave/leave.module';
import { SchoolAdminModule } from './school-admin/school-admin.module';
import { SubstitutionModule } from './substitution/substitution.module';
import { AttendanceMonitorModule } from './attendance-monitor/attendance-monitor.module';
import { PrincipalProfileModule } from './profile/principal-profile.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PrincipalLessonTrackerModule } from './lesson-tracker/lesson-tracker.module';
import { InquiryModule } from './inquiry/inquiry.module';



@Module({
    imports: [
        RoomModule,
        ClassModule,
        SectionModule,
        RoomAssignmentModule,
        TeacherModule,
        GlobalModule,
        AcademicYearModule,
        CalendarModule,
        DepartmentModule,
        SubjectModule,
        StudentModule,
        HouseModule,
        GrievanceModule,
        RoleModule,
        TimetableModule,
        AttendanceModule,
        PrincipalLeaveTypeModule,
        PrincipalLeaveModule,
        PrincipalAnnouncementModule,
        PrincipalNoticeModule,
        PrincipalDiaryModule,
        SchoolAdminModule,
        SubstitutionModule,
        AttendanceMonitorModule,
        PrincipalProfileModule,
        DashboardModule,
        PrincipalLessonTrackerModule,
        InquiryModule,
    ],
})
export class PrincipalModule { }
