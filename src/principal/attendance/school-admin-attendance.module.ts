import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { SchoolAdminAttendanceController } from './school-admin-attendance.controller';
import { SchoolAdminAttendanceService } from './school-admin-attendance.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
    imports: [PrismaModule, AuthModule, HttpModule, ConfigModule],
    controllers: [SchoolAdminAttendanceController],
    providers: [SchoolAdminAttendanceService],
})
export class SchoolAdminAttendanceModule { }
