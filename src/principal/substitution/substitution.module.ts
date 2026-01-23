import { Module } from '@nestjs/common';
import { SubstitutionController } from './substitution.controller';
import { SubstitutionService } from './substitution.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [HttpModule, ConfigModule],
    controllers: [SubstitutionController],
    providers: [SubstitutionService],
})
export class SubstitutionModule { }
