import { Module, Global } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditLogService } from './audit-log.service';
import { AuditLogListener } from './audit-log.listener';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditInterceptor } from './audit.interceptor';
import { PrincipalAuditLogController } from '../../principal/audit-log/audit-log.controller';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Global()
@Module({
    imports: [
        PrismaModule,
        HttpModule,
        ConfigModule,
        EventEmitterModule.forRoot({
            wildcard: false,
            delimiter: '.',
            newListener: false,
            removeListener: false,
            maxListeners: 10,
            verboseMemoryLeak: false,
            ignoreErrors: false,
        }),
    ],
    controllers: [PrincipalAuditLogController],
    providers: [
        AuditLogService,
        AuditLogListener,
        {
            provide: APP_INTERCEPTOR,
            useClass: AuditInterceptor,
        },
    ],
    exports: [AuditLogService],
})
export class AuditLogModule { }
