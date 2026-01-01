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

            // Safe enum casting
            let actionEnum: AuditAction;
            if (event.action === 'CREATE' || event.action === 'POST') actionEnum = AuditAction.CREATE;
            else if (event.action === 'UPDATE' || event.action === 'PATCH' || event.action === 'PUT') actionEnum = AuditAction.UPDATE;
            else if (event.action === 'DELETE') actionEnum = AuditAction.DELETE;
            else return; // Ignore other actions for now unless allowed

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

    async findAll(filter: { page?: number; limit?: number; schoolId?: number; userId?: number; entity?: string; action?: string; }) {
        const { page = 1, limit = 20, schoolId, userId, entity, action } = filter;
        const skip = (page - 1) * limit;

        const where: Prisma.AuditLogWhereInput = {};

        if (schoolId) where.schoolId = schoolId;
        if (userId) where.userId = userId;
        if (entity) where.entity = { contains: entity, mode: 'insensitive' };
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
