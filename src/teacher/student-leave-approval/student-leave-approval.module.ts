import { Module } from '@nestjs/common';
import { StudentLeaveApprovalController } from './student-leave-approval.controller';
import { StudentLeaveApprovalService } from './student-leave-approval.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { NotificationModule } from '../../principal/global/notification/notification.module';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule, NotificationModule],
    controllers: [StudentLeaveApprovalController],
    providers: [StudentLeaveApprovalService],
})
export class StudentLeaveApprovalModule { }
