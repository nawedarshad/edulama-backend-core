import { Module } from '@nestjs/common';
import { SubjectService } from './subject.service';
import { SubjectController } from './subject.controller';
import { AllocationController } from './allocation/allocation.controller'; // Import
import { AllocationService } from './allocation/allocation.service'; // Import

import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [HttpModule, ConfigModule],
    controllers: [SubjectController, AllocationController], // Register Controller
    providers: [SubjectService, AllocationService], // Register Service
    exports: [SubjectService],
})
export class SubjectModule { }
