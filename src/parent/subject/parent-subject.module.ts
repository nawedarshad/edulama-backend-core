import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ParentSubjectController } from './parent-subject.controller';
import { ParentSubjectService } from './parent-subject.service';

@Module({
    imports: [PrismaModule],
    controllers: [ParentSubjectController],
    providers: [ParentSubjectService],
    exports: [ParentSubjectService]
})
export class ParentSubjectModule { }
