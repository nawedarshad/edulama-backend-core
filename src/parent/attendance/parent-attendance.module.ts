import { Module } from '@nestjs/common';
import { ParentAttendanceController } from './parent-attendance.controller';
import { ParentAttendanceService } from './parent-attendance.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [ParentAttendanceController],
    providers: [ParentAttendanceService],
})
export class ParentAttendanceModule { }
