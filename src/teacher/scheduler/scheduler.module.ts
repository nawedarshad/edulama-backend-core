import { Module } from '@nestjs/common';
import { SchedulerController } from './scheduler.controller';
import { SchedulerService } from './scheduler.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
    controllers: [SchedulerController],
    providers: [SchedulerService, PrismaService],
})
export class TeacherSchedulerModule { }
