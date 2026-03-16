import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { StudentSubjectController } from './student-subject.controller';
import { StudentSubjectService } from './student-subject.service';

@Module({
    imports: [PrismaModule],
    controllers: [StudentSubjectController],
    providers: [StudentSubjectService],
    exports: [StudentSubjectService]
})
export class StudentSubjectModule { }
