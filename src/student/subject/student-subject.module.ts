import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { StudentSubjectController } from './student-subject.controller';
import { StudentSubjectService } from './student-subject.service';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule],
    controllers: [StudentSubjectController],
    providers: [StudentSubjectService],
    exports: [StudentSubjectService]
})
export class StudentSubjectModule { }
