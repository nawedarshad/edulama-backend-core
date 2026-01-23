import { Module } from '@nestjs/common';
import { TeacherStudentService } from './student.service';
import { TeacherStudentController } from './student.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [HttpModule, ConfigModule],
    controllers: [TeacherStudentController],
    providers: [TeacherStudentService, PrismaService],
})
export class TeacherStudentModule { }
