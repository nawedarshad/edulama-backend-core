import { Module } from '@nestjs/common';
import { TeacherAnnouncementController } from './teacher-announcement.controller';
import { TeacherAnnouncementService } from './teacher-announcement.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [HttpModule, ConfigModule],
    controllers: [TeacherAnnouncementController],
    providers: [TeacherAnnouncementService],
})
export class TeacherAnnouncementModule { }
