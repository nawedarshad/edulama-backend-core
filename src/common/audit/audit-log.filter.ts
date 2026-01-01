export interface AuditLogFilter {
    page?: number;
    limit?: number;
    schoolId?: number;
    userId?: number;
    entity?: string;
    action?: string;
}
