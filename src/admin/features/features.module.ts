
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { FeaturesController } from './features.controller';
import { FeaturesService } from './features.service';

@Module({
    imports: [HttpModule, ConfigModule],
    controllers: [FeaturesController],
    providers: [FeaturesService],
    exports: [FeaturesService],
})
export class FeaturesModule { }
