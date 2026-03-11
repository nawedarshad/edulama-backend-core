import { Controller, Get, UseGuards, Request, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { TeacherAuthGuard } from '../../common/guards/teacher.guard';
import { TeacherClassService } from './class.service';

import { RequiredModule } from '../../common/decorators/required-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';

@ApiTags('Teacher - Classes')
@ApiBearerAuth()
@Controller('teacher/classes')
@UseGuards(TeacherAuthGuard, ModuleGuard)
@RequiredModule('CLASSES')
export class TeacherClassController {
    constructor(private readonly classService: TeacherClassService) { }

    @Get()
    @ApiOperation({ summary: 'Get all classes (Minimal)' })
    @ApiResponse({ status: 200, description: 'List of classes' })
    async findAll(@Request() req) {
        return this.classService.findAll(req.user.schoolId, req.user.id);
    }
}
