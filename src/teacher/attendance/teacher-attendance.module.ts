import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TeacherAttendanceController } from './teacher-attendance.controller';
import { TeacherAttendanceService } from './teacher-attendance.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AttendanceConfigModule } from 'src/principal/attendance-config/attendance-config.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
    imports: [
        HttpModule,
        ConfigModule,
        AttendanceConfigModule,
        PrismaModule,
        AuthModule
    ],
    controllers: [TeacherAttendanceController],
    providers: [TeacherAttendanceService],
})
export class TeacherAttendanceModule { }
