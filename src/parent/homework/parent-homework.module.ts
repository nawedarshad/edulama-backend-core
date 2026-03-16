import { Module } from '@nestjs/common';
import { ParentHomeworkController } from './parent-homework.controller';
import { ParentHomeworkService } from './parent-homework.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [ParentHomeworkController],
    providers: [ParentHomeworkService],
    exports: [ParentHomeworkService],
})
export class ParentHomeworkModule { }
