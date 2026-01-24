import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
    imports: [HttpModule, ConfigModule],
    controllers: [DashboardController],
    providers: [DashboardService],
})
export class DashboardModule { }
