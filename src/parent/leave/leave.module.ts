import { Module } from '@nestjs/common';
import { ParentLeaveController } from './leave.controller';
import { ParentLeaveService } from './leave.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CalendarModule } from '../../principal/calendar/calendar.module';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [PrismaModule, CalendarModule, HttpModule, ConfigModule],
    controllers: [ParentLeaveController],
    providers: [ParentLeaveService],
})
export class ParentLeaveModule { }
