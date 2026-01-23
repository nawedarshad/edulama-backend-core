import { Module } from '@nestjs/common';
import { PrincipalNoticeService } from './principal-notice.service';
import { PrincipalNoticeController } from './principal-notice.controller';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [HttpModule, ConfigModule],
    controllers: [PrincipalNoticeController],
    providers: [PrincipalNoticeService],
})
export class PrincipalNoticeModule { }
