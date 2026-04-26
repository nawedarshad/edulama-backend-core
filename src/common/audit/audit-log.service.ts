import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogEvent } from './audit.event';
import { AuditAction, Prisma } from '@prisma/client';

@Injectable()
export class AuditLogService {
    private readonly logger = new Logger(AuditLogService.name);

    constructor(private readonly prisma: PrismaService) { }

    async createLog(event: AuditLogEvent) {
        try {
            // Map string action to Enum if needed, or use as is if strictly typed
            // Assuming the event.action matches AuditAction names (CREATE, UPDATE, DELETE)

            // BUG FIX: Extended actions like UPDATE_STATUS, BULK_CREATE, BULK_PROMOTE were
            // silently dropped. Now mapped to the nearest AuditAction enum value.
            let actionEnum: AuditAction;
            const actionUpper = (event.action as string).toUpperCase();
            if (actionUpper === 'CREATE' || actionUpper === 'POST' || actionUpper.startsWith('BULK_CREATE')) {
                actionEnum = AuditAction.CREATE;
            } else if (actionUpper === 'DELETE' || actionUpper === 'BULK_DELETE') {
                actionEnum = AuditAction.DELETE;
            } else {
                // UPDATE, PATCH, PUT, UPDATE_STATUS, BULK_PROMOTE, BULK_DEACTIVATE, etc.
                actionEnum = AuditAction.UPDATE;
            }

            await this.prisma.auditLog.create({
                data: {
                    schoolId: event.schoolId,
                    userId: event.userId,
                    entity: event.entity,
                    entityId: event.entityId,
                    action: actionEnum,
                    newValue: event.newValue ?? undefined,
                    ipAddress: event.ipAddress,
                },
            });
        } catch (error) {
            this.logger.error('Failed to persist audit log', error);
        }
    }

    async findAll(filter: { 
        page?: number; 
        limit?: number; 
        schoolId?: number; 
        userId?: number; 
        entity?: string; 
        entityId?: number; 
        entities?: string[];
        entityIds?: number[];
        action?: string; 
    }) {
        const { page = 1, limit = 20, schoolId, userId, entity, entityId, entities, entityIds, action } = filter;
        const skip = (page - 1) * limit;

        const where: Prisma.AuditLogWhereInput = {};

        if (schoolId) where.schoolId = schoolId;
        if (userId) where.userId = userId;
        
        if (entities && entities.length > 0 && entityIds && entityIds.length > 0) {
            where.OR = [
                {
                    entity: { in: entities },
                    entityId: { in: entityIds.map(id => Number(id)) }
                }
            ];
        } else {
            if (entity) where.entity = { contains: entity, mode: 'insensitive' };
            if (entityId) where.entityId = Number(entityId);
        }

        if (action) where.action = action as AuditAction;

        const [logs, total] = await Promise.all([
            this.prisma.auditLog.findMany({
                where,
                skip,
                take: Number(limit), // Ensure numeric
                orderBy: { createdAt: 'desc' },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            // Email logic would be complex here due to AuthIdentity, 
                            // but for logs, user ID/Name is often sufficient context.
                        }
                    },
                    school: {
                        select: {
                            id: true,
                            name: true,
                        }
                    }
                }
            }),
            this.prisma.auditLog.count({ where }),
        ]);

        // Transform BigInt to string if necessary for JSON serialization
        const serializedLogs = logs.map(log => ({
            ...log,
            id: log.id.toString(),
            entityId: log.entityId ? Number(log.entityId) : null, // Handle BigInt if entityId was huge, but it's Int in schema
        }));

        return {
            data: serializedLogs,
            total,
            page: Number(page),
            limit: Number(limit),
            lastPage: Math.ceil(total / limit),
        };
    }
}
