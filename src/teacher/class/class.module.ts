import { Module } from '@nestjs/common';
import { TeacherClassService } from './class.service';
import { TeacherClassController } from './class.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [HttpModule, ConfigModule],
    controllers: [TeacherClassController],
    providers: [TeacherClassService, PrismaService],
})
export class TeacherClassModule { }
