import { Module } from '@nestjs/common';
import { TeacherNoticeService } from './teacher-notice.service';
import { TeacherNoticeController } from './teacher-notice.controller';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [HttpModule, ConfigModule],
    controllers: [TeacherNoticeController],
    providers: [TeacherNoticeService],
})
export class TeacherNoticeModule { }
