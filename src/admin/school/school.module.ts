
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { SchoolController } from './school.controller';
import { SchoolService } from './school.service';

@Module({
    imports: [HttpModule, ConfigModule],
    controllers: [SchoolController],
    providers: [SchoolService],
})
export class SchoolModule { }
