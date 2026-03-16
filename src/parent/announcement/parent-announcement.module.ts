import { Module } from '@nestjs/common';
import { ParentAnnouncementController } from './parent-announcement.controller';
import { ParentAnnouncementService } from './parent-announcement.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule],
    controllers: [ParentAnnouncementController],
    providers: [ParentAnnouncementService],
})
export class ParentAnnouncementModule {}
