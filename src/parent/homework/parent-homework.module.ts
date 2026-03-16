import { Module } from '@nestjs/common';
import { ParentHomeworkController } from './parent-homework.controller';
import { ParentHomeworkService } from './parent-homework.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule],
    controllers: [ParentHomeworkController],
    providers: [ParentHomeworkService],
    exports: [ParentHomeworkService],
})
export class ParentHomeworkModule { }
