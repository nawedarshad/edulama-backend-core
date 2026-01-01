import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
    Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AUDIT_LOG_ENTITY_KEY } from './audit.decorator';
import { AuditLogEvent } from './audit.event';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
    private readonly logger = new Logger(AuditInterceptor.name);

    constructor(
        private readonly reflector: Reflector,
        private readonly eventEmitter: EventEmitter2,
    ) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const entity = this.reflector.get<string>(
            AUDIT_LOG_ENTITY_KEY,
            context.getClass(),
        );

        // If no entity metadata, skip auditing
        if (!entity) {
            return next.handle();
        }

        const request = context.switchToHttp().getRequest();
        const method = request.method;

        // Skip GET requests unless specifically needed
        if (method === 'GET') {
            return next.handle();
        }

        return next.handle().pipe(
            tap((data) => {
                try {
                    const user = request.user;
                    if (!user || !user.schoolId) return;

                    const schoolId = user.schoolId;
                    const userId = user.id;
                    const ipAddress = request.ip || request.connection.remoteAddress;

                    // Determine Entity ID (from response or params)
                    let entityId: number | undefined;
                    if (data && data.id) {
                        entityId = typeof data.id === 'bigint' ? Number(data.id) : data.id;
                    } else if (request.params.id) {
                        entityId = parseInt(request.params.id, 10);
                    }

                    // Prepare payload (sanitize if needed, e.g., remove passwords)
                    // NestJS BigInt handling might be an issue here if data contains BigInt, 
                    // providing JSON stringify works. But event payload is internal.
                    // For DB, Prisma handles object -> Json.

                    this.eventEmitter.emit(
                        'audit.log',
                        new AuditLogEvent(
                            schoolId,
                            userId,
                            entity,
                            method, // POST, PATCH, DELETE
                            entityId,
                            data, // New Value
                            ipAddress,
                        ),
                    );
                } catch (error) {
                    this.logger.error('Error dispatching audit event', error);
                }
            }),
        );
    }
}
