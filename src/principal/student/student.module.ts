import { Module } from '@nestjs/common';
import { StudentService } from './student.service';
import { StudentController } from './student.controller';
import { PrismaService } from '../../prisma/prisma.service';

import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [HttpModule, ConfigModule],
    controllers: [StudentController],
    providers: [StudentService, PrismaService],
})
export class StudentModule { }
