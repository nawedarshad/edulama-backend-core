import { Module } from '@nestjs/common';
import { StudentHomeworkController } from './student-homework.controller';
import { StudentHomeworkService } from './student-homework.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule],
    controllers: [StudentHomeworkController],
    providers: [StudentHomeworkService],
    exports: [StudentHomeworkService],
})
export class StudentHomeworkModule { }
