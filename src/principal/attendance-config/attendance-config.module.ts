import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { AttendanceConfigController } from './attendance-config.controller';
import { AttendanceConfigService } from './attendance-config.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule],
    controllers: [AttendanceConfigController],
    providers: [AttendanceConfigService],
    exports: [AttendanceConfigService],
})
export class AttendanceConfigModule { }
