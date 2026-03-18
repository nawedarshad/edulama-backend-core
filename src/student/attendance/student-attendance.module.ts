import { Module } from '@nestjs/common';
import { StudentAttendanceController } from './student-attendance.controller';
import { StudentAttendanceService } from './student-attendance.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [StudentAttendanceController],
    providers: [StudentAttendanceService],
})
export class StudentAttendanceModule { }
