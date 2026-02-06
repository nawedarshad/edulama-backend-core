import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';

import { TeacherClassDiaryController } from './teacher-class-diary.controller';
import { TeacherLessonContentController } from './teacher-lesson-content.controller';
import { TeacherClassDiaryService } from './teacher-class-diary.service';
import { AuditLogModule } from '../../common/audit/audit-log.module';

import { HttpModule } from '@nestjs/axios';

import { LessonContentService } from './lesson-content.service';
import { LessonAnalyticsService } from './lesson-analytics.service';

@Module({
    imports: [PrismaModule, AuditLogModule, HttpModule],
    controllers: [TeacherClassDiaryController, TeacherLessonContentController],
    providers: [TeacherClassDiaryService, LessonContentService, LessonAnalyticsService],
    exports: [TeacherClassDiaryService, LessonContentService, LessonAnalyticsService],
})
export class TeacherLessonModule { }
