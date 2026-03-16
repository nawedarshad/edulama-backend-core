import { Module } from '@nestjs/common';
import { StudentHomeworkController } from './student-homework.controller';
import { StudentHomeworkService } from './student-homework.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [StudentHomeworkController],
    providers: [StudentHomeworkService],
    exports: [StudentHomeworkService],
})
export class StudentHomeworkModule { }
