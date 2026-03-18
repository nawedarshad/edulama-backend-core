import { Module } from '@nestjs/common';
import { ParentAttendanceController } from './parent-attendance.controller';
import { ParentAttendanceService } from './parent-attendance.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule],
    controllers: [ParentAttendanceController],
    providers: [ParentAttendanceService],
})
export class ParentAttendanceModule { }
