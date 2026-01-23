import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TeacherTimetableController } from './teacher-timetable.controller';
import { TeacherTimetableService } from './teacher-timetable.service';
import { HttpModule } from '@nestjs/axios';

@Module({
    imports: [PrismaModule, HttpModule],
    controllers: [TeacherTimetableController],
    providers: [TeacherTimetableService],
    exports: [TeacherTimetableService],
})
export class TeacherTimetableModule { }
