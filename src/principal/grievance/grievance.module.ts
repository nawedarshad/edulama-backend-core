import { Module } from '@nestjs/common';
import { GrievanceService } from './grievance.service';
import { GrievanceController } from './grievance.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [HttpModule, ConfigModule],
    controllers: [GrievanceController],
    providers: [GrievanceService, PrismaService],
    exports: [GrievanceService]
})
export class GrievanceModule { }
