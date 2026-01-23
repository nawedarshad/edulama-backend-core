import { Module } from '@nestjs/common';
import { SaaSAdminService } from './saas-admin.service';
import { SaaSAdminController } from './saas-admin.controller';
import { SaaSAdminFeaturesController } from './saas-admin-features.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [SaaSAdminController, SaaSAdminFeaturesController],
    providers: [SaaSAdminService],
    exports: [SaaSAdminService],
})
export class SaaSAdminModule { }
