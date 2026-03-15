import { Module } from '@nestjs/common';
import { UserManagementService } from './user-management.service';
import { UserManagementController } from './user-management.controller';

import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

import { PrincipalAuthGuard } from '../../common/guards/principal.guard';

@Module({
    imports: [HttpModule, ConfigModule],
    providers: [UserManagementService, PrincipalAuthGuard],
    controllers: [UserManagementController],
    exports: [UserManagementService]
})
export class UserManagementModule { }
