import { Module } from '@nestjs/common';
import { TeacherSectionService } from './section.service';
import { TeacherSectionController } from './section.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [HttpModule, ConfigModule],
    controllers: [TeacherSectionController],
    providers: [TeacherSectionService, PrismaService],
})
export class TeacherSectionModule { }
