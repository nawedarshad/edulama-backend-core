import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ParentClassDiaryController } from './parent-class-diary.controller';
import { ParentClassDiaryService } from './parent-class-diary.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule],
    controllers: [ParentClassDiaryController],
    providers: [ParentClassDiaryService],
    exports: [ParentClassDiaryService],
})
export class ParentClassDiaryModule { }
