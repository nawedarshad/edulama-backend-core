import { Controller, Get, Param, UseGuards, Request, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { StudentHomeworkService } from './student-homework.service';
import { StudentAuthGuard } from '../../common/guards/student.guard';
import { ModuleGuard } from '../../common/guards/module.guard';
import { RequiredModule } from '../../common/decorators/required-module.decorator';

@ApiTags('Student - Homework')
@ApiBearerAuth()
@UseGuards(StudentAuthGuard, ModuleGuard)
@RequiredModule('HOMEWORK')
@Controller('student/homework')
export class StudentHomeworkController {
    constructor(private readonly homeworkService: StudentHomeworkService) { }

    @ApiOperation({ summary: 'Get all homework assigned to the student' })
    @Get()
    findAll(@Request() req, @Query() query: any) {
        return this.homeworkService.findAll(req.user.schoolId, req.user.id, req.user.academicYearId, query);
    }

    @ApiOperation({ summary: 'Get single homework details with student submission status' })
    @Get(':id')
    findOne(@Request() req, @Param('id') id: string) {
        return this.homeworkService.findOne(req.user.schoolId, req.user.id, +id);
    }
}
