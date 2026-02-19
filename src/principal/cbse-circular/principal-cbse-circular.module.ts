import { Module } from '@nestjs/common';
import { PrincipalCbseCircularService } from './principal-cbse-circular.service';
import { PrincipalCbseCircularController } from './principal-cbse-circular.controller';
import { PrismaModule } from '../../prisma/prisma.module';

import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule],
    controllers: [PrincipalCbseCircularController],
    providers: [PrincipalCbseCircularService],
})
export class PrincipalCbseCircularModule { }
