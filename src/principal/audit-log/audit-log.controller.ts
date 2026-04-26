import { Controller, Get, Query, Req, UseGuards, ParseIntPipe, DefaultValuePipe, Optional } from '@nestjs/common';
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
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
        @Query('entity') entity?: string,
        @Query('entityId', new DefaultValuePipe(0), ParseIntPipe) entityId?: number,
        @Query('entities') entities?: string,
        @Query('entityIds') entityIds?: string,
        @Query('action') action?: string,
        @Query('userId', new DefaultValuePipe(0), ParseIntPipe) userId?: number,
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
