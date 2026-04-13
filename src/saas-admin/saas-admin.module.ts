import { Module } from '@nestjs/common';
import { SaaSAdminService } from './saas-admin.service';
import { SaaSAdminController } from './saas-admin.controller';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { SaaSAdminFeaturesController } from './saas-admin-features.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PlatformSettingsModule } from './settings/platform-settings.module';
import { AnalyticsService } from './analytics/analytics.service';
import { AnalyticsController } from './analytics/analytics.controller';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule, PlatformSettingsModule],
    controllers: [SaaSAdminController, SaaSAdminFeaturesController, AnalyticsController],
    providers: [SaaSAdminService, AnalyticsService],
    exports: [SaaSAdminService, AnalyticsService],
})
export class SaaSAdminModule { }
