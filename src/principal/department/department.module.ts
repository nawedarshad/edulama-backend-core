import { Module } from '@nestjs/common';
import { DepartmentService } from './department.service';
import { DepartmentController } from './department.controller';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule],
    controllers: [DepartmentController],
    providers: [DepartmentService],
})
export class DepartmentModule { }
