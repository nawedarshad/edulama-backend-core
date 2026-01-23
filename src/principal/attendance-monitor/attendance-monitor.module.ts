import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { AttendanceMonitorController } from './attendance-monitor.controller';
import { AttendanceMonitorService } from './attendance-monitor.service';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule],
    controllers: [AttendanceMonitorController],
    providers: [AttendanceMonitorService],
    exports: [AttendanceMonitorService],
})
export class AttendanceMonitorModule { }
