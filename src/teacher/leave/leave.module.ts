import { Module } from '@nestjs/common';
import { TeacherLeaveController } from './leave.controller';
import { TeacherLeaveService } from './leave.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { CalendarModule } from '../../principal/calendar/calendar.module';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule, CalendarModule],
    controllers: [TeacherLeaveController],
    providers: [TeacherLeaveService],
})
export class TeacherLeaveModule { }
