import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AuditLogService } from './audit-log.service';
import { AuditLogEvent } from './audit.event';

@Injectable()
export class AuditLogListener {
    constructor(private readonly auditLogService: AuditLogService) { }

    @OnEvent('audit.log', { async: true })
    async handleAuditLogEvent(event: AuditLogEvent) {
        await this.auditLogService.createLog(event);
    }
}
