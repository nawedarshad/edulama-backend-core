import { Module } from '@nestjs/common';
import { GrievanceService } from './grievance.service';
import { GrievanceController } from './grievance.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { NotificationModule } from '../global/notification/notification.module';

@Module({
    imports: [HttpModule, ConfigModule, NotificationModule],
    controllers: [GrievanceController],
    providers: [GrievanceService, PrismaService],
    exports: [GrievanceService]
})
export class GrievanceModule { }
