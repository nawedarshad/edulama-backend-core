import { Module } from '@nestjs/common';
import { SubstitutionController } from './substitution.controller';
import { SubstitutionService } from './substitution.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { NotificationModule } from '../global/notification/notification.module';

@Module({
    imports: [HttpModule, ConfigModule, NotificationModule],
    controllers: [SubstitutionController],
    providers: [SubstitutionService],
})
export class SubstitutionModule { }
