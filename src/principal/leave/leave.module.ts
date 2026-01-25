import { Module } from '@nestjs/common';
import { PrincipalLeaveController } from './leave.controller';
import { PrincipalLeaveService } from './leave.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { CalendarModule } from '../calendar/calendar.module';
import { NotificationModule } from '../global/notification/notification.module';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule, CalendarModule, NotificationModule],
    controllers: [PrincipalLeaveController],
    providers: [PrincipalLeaveService],
})
export class PrincipalLeaveModule { }
