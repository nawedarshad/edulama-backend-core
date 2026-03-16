import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { ParentSubjectController } from './parent-subject.controller';
import { ParentSubjectService } from './parent-subject.service';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule],
    controllers: [ParentSubjectController],
    providers: [ParentSubjectService],
    exports: [ParentSubjectService]
})
export class ParentSubjectModule { }
