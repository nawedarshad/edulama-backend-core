import { Module } from '@nestjs/common';
import { RoomModule } from './room/room.module';
import { ClassModule } from './class/class.module';
import { SectionModule } from './section/section.module';
import { RoomAssignmentModule } from './room-assignment/room-assignment.module';
import { TeacherModule } from './teacher/teacher.module';
import { GlobalModule } from './global/global.module';

import { AcademicYearModule } from './academic-year/academic-year.module';
import { CalendarModule } from './calendar/calendar.module';

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
    ],
})
export class PrincipalModule { }
