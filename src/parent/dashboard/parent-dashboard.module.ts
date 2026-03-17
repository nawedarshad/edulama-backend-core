import { Module } from '@nestjs/common';
import { ParentDashboardController } from './parent-dashboard.controller';
import { ParentDashboardService } from './parent-dashboard.service';

@Module({
    controllers: [ParentDashboardController],
    providers: [ParentDashboardService],
    exports: [ParentDashboardService],
})
export class ParentDashboardModule { }
