import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TeacherHomeworkService } from './teacher-homework.service';
import { TeacherHomeworkController } from './teacher-homework.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule],
    providers: [TeacherHomeworkService],
    controllers: [TeacherHomeworkController],
    exports: [TeacherHomeworkService],
})
export class TeacherHomeworkModule { }
