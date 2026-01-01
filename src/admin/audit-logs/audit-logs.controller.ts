import { Controller, Get, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { AdminAuthGuard } from '../../common/guards/admin.guard';
import { AuditLogFilter } from '../../common/audit/audit-log.filter';

@Controller('admin/logs') // URL remains generic /logs, file structure uses audit-logs
@UseGuards(AdminAuthGuard)
export class AdminLogsController {
    constructor(private readonly auditLogService: AuditLogService) { }

    @Get()
    async findAll(
        @Query('page', new ParseIntPipe({ optional: true })) page?: number,
        @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
        @Query('schoolId', new ParseIntPipe({ optional: true })) schoolId?: number,
        @Query('action') action?: string,
        @Query('entity') entity?: string,
    ) {
        const filter: AuditLogFilter = {
            page: page || 1,
            limit: limit || 20,
            schoolId,
            action,
            entity,
        };

        return this.auditLogService.findAll(filter);
    }
}
