import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ParentDashboardController } from './parent-dashboard.controller';
import { ParentDashboardService } from './parent-dashboard.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
    imports: [
        HttpModule,
        ConfigModule,
        PrismaModule,
    ],
    controllers: [ParentDashboardController],
    providers: [ParentDashboardService],
    exports: [ParentDashboardService],
})
export class ParentDashboardModule { }
