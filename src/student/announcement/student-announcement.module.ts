import { Module } from '@nestjs/common';
import { StudentAnnouncementController } from './student-announcement.controller';
import { StudentAnnouncementService } from './student-announcement.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule],
    controllers: [StudentAnnouncementController],
    providers: [StudentAnnouncementService],
})
export class StudentAnnouncementModule {}
