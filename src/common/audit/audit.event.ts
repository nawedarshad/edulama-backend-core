export class AuditLogEvent {
    constructor(
        public readonly schoolId: number,
        public readonly userId: number,
        public readonly entity: string,
        public readonly action: string,
        public readonly entityId?: number,
        public readonly newValue?: any,
        public readonly ipAddress?: string,
    ) { }
}
