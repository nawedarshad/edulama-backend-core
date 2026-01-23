import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TeacherAttendanceController } from './attendance.controller';
import { TeacherAttendanceService } from './attendance.service';
import { GlobalModule } from '../../principal/global/global.module'; // Access to SchoolSettingsService

@Module({
    imports: [
        HttpModule,
        ConfigModule,
        GlobalModule
    ],
    controllers: [TeacherAttendanceController],
    providers: [TeacherAttendanceService],
})
export class TeacherAttendanceModule { }
