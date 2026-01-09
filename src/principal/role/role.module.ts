import { Module } from '@nestjs/common';
import { RoleService } from './role.service';
import { RoleController } from './role.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [HttpModule, ConfigModule], // Required for PrincipalAuthGuard
    controllers: [RoleController],
    providers: [RoleService, PrismaService],
})
export class RoleModule { }
