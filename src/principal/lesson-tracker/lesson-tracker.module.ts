import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrincipalLessonTrackerController } from './lesson-tracker.controller';
import { PrincipalLessonTrackerService } from './lesson-tracker.service';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule],
    controllers: [PrincipalLessonTrackerController],
    providers: [PrincipalLessonTrackerService],
    exports: [PrincipalLessonTrackerService]
})
export class PrincipalLessonTrackerModule { }
