import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TeacherTimetableController } from './teacher-timetable.controller';
import { TeacherTimetableService } from './teacher-timetable.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule],
    controllers: [TeacherTimetableController],
    providers: [TeacherTimetableService],
    exports: [TeacherTimetableService],
})
export class TeacherTimetableModule { }
