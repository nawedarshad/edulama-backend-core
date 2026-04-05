import { Module } from '@nestjs/common';
import { StudentService } from './student.service';
import { StudentController } from './student.controller';
import { PrismaService } from '../../prisma/prisma.service';

import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { AuditLogModule } from '../../common/audit/audit-log.module';
import { FileUploadModule } from '../../common/file-upload/file-upload.module';

@Module({
    imports: [HttpModule, ConfigModule, AuditLogModule, FileUploadModule],
    controllers: [StudentController],
    providers: [StudentService, PrismaService],
})
export class StudentModule { }
