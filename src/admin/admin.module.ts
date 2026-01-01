import { Module } from '@nestjs/common';
import { SchoolModule } from './school/school.module';
import { FeaturesModule } from './features/features.module';
import { AcademicYearModule } from './academic-year/academic-year.module';
import { AdminAuditLogsModule } from './audit-logs/audit-logs.module';

@Module({
    imports: [SchoolModule, FeaturesModule, AcademicYearModule, AdminAuditLogsModule],
})
export class AdminModule { }
