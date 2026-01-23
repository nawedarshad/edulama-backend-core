import { Module } from '@nestjs/common';
import { PrincipalLeaveTypeController } from './leave-type.controller';
import { PrincipalLeaveTypeService } from './leave-type.service';
import { StudentLeaveWorkflowController } from './student-leave-workflow.controller';
import { StudentLeaveWorkflowService } from './student-leave-workflow.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule],
    controllers: [PrincipalLeaveTypeController, StudentLeaveWorkflowController],
    providers: [PrincipalLeaveTypeService, StudentLeaveWorkflowService],
})
export class PrincipalLeaveTypeModule { }
