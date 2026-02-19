
import { Module } from '@nestjs/common';
import { WebPageService } from './web-page.service';
import { WebPageController } from './web-page.controller';
import { PrismaModule } from '../prisma/prisma.module';

import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule],
    controllers: [WebPageController],
    providers: [WebPageService],
    exports: [WebPageService],
})
export class WebPageModule { }
