import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { SchedulerController } from './scheduler.controller';
import { SchedulerService } from './scheduler.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
    imports: [HttpModule, ConfigModule],
    controllers: [SchedulerController],
    providers: [SchedulerService, PrismaService],
})
export class TeacherSchedulerModule { }
