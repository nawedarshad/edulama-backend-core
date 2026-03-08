import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AcademicGroupController } from './academic-group.controller';
import { AcademicGroupService } from './academic-group.service';

@Module({
    imports: [HttpModule],
    controllers: [AcademicGroupController],
    providers: [AcademicGroupService],
    exports: [AcademicGroupService],
})
export class AcademicGroupModule { }
