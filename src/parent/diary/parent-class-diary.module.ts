import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ParentClassDiaryController } from './parent-class-diary.controller';
import { ParentClassDiaryService } from './parent-class-diary.service';
import { HttpModule } from '@nestjs/axios';

@Module({
    imports: [PrismaModule, HttpModule],
    controllers: [ParentClassDiaryController],
    providers: [ParentClassDiaryService],
    exports: [ParentClassDiaryService],
})
export class ParentClassDiaryModule { }
