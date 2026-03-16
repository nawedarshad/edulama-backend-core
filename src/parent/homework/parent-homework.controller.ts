import { Controller, Get, Param, UseGuards, Request, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ParentHomeworkService } from './parent-homework.service';
import { ParentAuthGuard } from '../../common/guards/parent.guard';
import { ModuleGuard } from '../../common/guards/module.guard';
import { RequiredModule } from '../../common/decorators/required-module.decorator';

@ApiTags('Parent - Homework')
@ApiBearerAuth()
@UseGuards(ParentAuthGuard, ModuleGuard)
@RequiredModule('HOMEWORK')
@Controller('parent/homework')
export class ParentHomeworkController {
    constructor(private readonly homeworkService: ParentHomeworkService) { }

    @ApiOperation({ summary: 'Get all homework assigned to a child' })
    @Get(':studentId')
    findAll(@Request() req, @Param('studentId') studentId: string, @Query() query: any) {
        return this.homeworkService.findAll(req.user.schoolId, req.user.id, +studentId, req.user.academicYearId, query);
    }

    @ApiOperation({ summary: 'Get single homework details for a child' })
    @Get(':studentId/:id')
    findOne(@Request() req, @Param('studentId') studentId: string, @Param('id') id: string) {
        return this.homeworkService.findOne(req.user.schoolId, req.user.id, +studentId, +id);
    }
}
