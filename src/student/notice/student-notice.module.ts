import { Module } from '@nestjs/common';
import { StudentNoticeService } from './student-notice.service';
import { StudentNoticeController } from './student-notice.controller';

import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [HttpModule, ConfigModule],
    controllers: [StudentNoticeController],
    providers: [StudentNoticeService],
})
export class StudentNoticeModule { }
