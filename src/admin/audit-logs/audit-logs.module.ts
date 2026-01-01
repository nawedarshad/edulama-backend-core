import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { AdminLogsController } from './audit-logs.controller';
// AuditLogService is provided by Global AuditLogModule

@Module({
    imports: [HttpModule, ConfigModule],
    controllers: [AdminLogsController],
})
export class AdminAuditLogsModule { }
