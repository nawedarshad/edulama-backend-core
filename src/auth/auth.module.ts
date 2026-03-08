import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PortalRedirectController } from './portal-redirect.controller';

@Module({
    imports: [HttpModule, ConfigModule],
    controllers: [PortalRedirectController],
})
export class AuthModule { }
