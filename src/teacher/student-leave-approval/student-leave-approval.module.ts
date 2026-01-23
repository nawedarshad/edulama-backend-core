import { Module } from '@nestjs/common';
import { StudentLeaveApprovalController } from './student-leave-approval.controller';
import { StudentLeaveApprovalService } from './student-leave-approval.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule],
    controllers: [StudentLeaveApprovalController],
    providers: [StudentLeaveApprovalService],
})
export class StudentLeaveApprovalModule { }
