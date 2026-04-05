import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Audit Logs')
@Controller('principal/audit-logs')
@UseGuards(PrincipalAuthGuard)
export class PrincipalAuditLogController {
    constructor(private readonly auditLogService: AuditLogService) { }

    @Get()
    @ApiOperation({ summary: 'List audit logs for the school' })
    @ApiResponse({ status: 200, description: 'Return audit logs.' })
    async findAll(
        @Req() req,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
        @Query('entity') entity?: string,
        @Query('entityId') entityId?: number,
        @Query('entities') entities?: string, // Comma separated entities
        @Query('entityIds') entityIds?: string, // Comma separated IDs
        @Query('action') action?: string,
        @Query('userId') userId?: number,
    ) {
        const schoolId = req.user.schoolId;
        return this.auditLogService.findAll({
            page,
            limit,
            schoolId,
            userId,
            entity,
            entityId,
            entities: entities ? entities.split(',') : undefined,
            entityIds: entityIds ? entityIds.split(',').map(id => Number(id)) : undefined,
            action,
        });
    }
}
