import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';

import { TeacherClassDiaryController } from './teacher-class-diary.controller';
import { TeacherClassDiaryService } from './teacher-class-diary.service';
import { AuditLogModule } from '../../common/audit/audit-log.module';

import { HttpModule } from '@nestjs/axios';

@Module({
    imports: [PrismaModule, AuditLogModule, HttpModule],
    controllers: [TeacherClassDiaryController],
    providers: [TeacherClassDiaryService],
    exports: [TeacherClassDiaryService],
})
export class TeacherLessonModule { }
