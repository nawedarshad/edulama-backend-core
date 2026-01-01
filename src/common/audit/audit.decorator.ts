import { SetMetadata } from '@nestjs/common';

export const AUDIT_LOG_ENTITY_KEY = 'audit_log_entity';
export const Audit = (entity: string) => SetMetadata(AUDIT_LOG_ENTITY_KEY, entity);
