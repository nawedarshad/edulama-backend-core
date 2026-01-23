import { Module } from '@nestjs/common';
import { ParentNoticeService } from './parent-notice.service';
import { ParentNoticeController } from './parent-notice.controller';

import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [HttpModule, ConfigModule],
    controllers: [ParentNoticeController],
    providers: [ParentNoticeService],
})
export class ParentNoticeModule { }
