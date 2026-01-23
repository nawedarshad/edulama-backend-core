import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TeacherSubjectController } from './teacher-subject.controller';
import { TeacherSubjectService } from './teacher-subject.service';

@Module({
    imports: [HttpModule, ConfigModule],
    controllers: [TeacherSubjectController],
    providers: [TeacherSubjectService],
    exports: [TeacherSubjectService],
})
export class TeacherSubjectModule { }
