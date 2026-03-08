import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PrincipalHomeworkService } from './principal-homework.service';
import { PrincipalHomeworkController } from './principal-homework.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule],
    providers: [PrincipalHomeworkService],
    controllers: [PrincipalHomeworkController],
    exports: [PrincipalHomeworkService],
})
export class PrincipalHomeworkModule { }
