import { Module } from '@nestjs/common';
import { ParentAnnouncementController } from './parent-announcement.controller';
import { ParentAnnouncementService } from './parent-announcement.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { HttpModule } from '@nestjs/axios';

@Module({
    imports: [PrismaModule, HttpModule],
    controllers: [ParentAnnouncementController],
    providers: [ParentAnnouncementService],
})
export class ParentAnnouncementModule {}
