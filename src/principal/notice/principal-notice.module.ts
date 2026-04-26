import { Module } from '@nestjs/common';
import { PrincipalNoticeService } from './principal-notice.service';
import { PrincipalNoticeController } from './principal-notice.controller';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { NotificationModule } from '../global/notification/notification.module';

@Module({
    imports: [HttpModule, ConfigModule, NotificationModule],
    controllers: [PrincipalNoticeController],
    providers: [PrincipalNoticeService],
})
export class PrincipalNoticeModule { }
