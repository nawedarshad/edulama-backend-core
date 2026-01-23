import { Module } from '@nestjs/common';
import { SchoolAdminService } from './school-admin.service';
import { SchoolAdminController } from './school-admin.controller';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
    imports: [
        PrismaModule,
        HttpModule,
        ConfigModule
    ],
    controllers: [SchoolAdminController],
    providers: [SchoolAdminService],
    exports: [SchoolAdminService],
})
export class SchoolAdminModule { }
