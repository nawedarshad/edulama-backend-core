
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { AcademicYearService } from './academic-year.service';
import { AcademicYearController } from './academic-year.controller';

@Module({
    imports: [HttpModule, ConfigModule],
    controllers: [AcademicYearController],
    providers: [AcademicYearService],
})
export class AcademicYearModule { }
