import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SaasAdminCbseCircularService } from './saas-admin-cbse-circular.service';
import { SaasAdminCbseCircularController } from './saas-admin-cbse-circular.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
    imports: [PrismaModule, HttpModule],
    controllers: [SaasAdminCbseCircularController],
    providers: [SaasAdminCbseCircularService],
})
export class SaasAdminCbseCircularModule { }
