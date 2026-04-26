import { Module } from '@nestjs/common';
import { DepartmentService } from './department.service';
import { DepartmentController } from './department.controller';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { CacheModule } from '@nestjs/cache-manager';
import { ExportService } from '../../common/services/export.service';

@Module({
    imports: [
        PrismaModule,
        HttpModule,
        ConfigModule,
        CacheModule.register({
            ttl: 3600000, 
            max: 1000,
        }),
    ],
    controllers: [DepartmentController],
    providers: [DepartmentService, ExportService],
})
export class DepartmentModule { }
