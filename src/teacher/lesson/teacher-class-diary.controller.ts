import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TeacherClassDiaryService } from './teacher-class-diary.service';
import { CreateClassDiaryDto } from './dto/create-class-diary.dto';
import { UpdateClassDiaryDto } from './dto/update-class-diary.dto';
import { ClassDiaryQueryDto } from './dto/class-diary-query.dto';
import { TeacherAuthGuard } from '../../common/guards/teacher.guard';

import { RequiredModule } from '../../common/decorators/required-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';

@ApiTags('Teacher - Class Diary')
@ApiBearerAuth()
@UseGuards(TeacherAuthGuard, ModuleGuard)
@RequiredModule('LESSON_PLANNING')
@Controller('teacher/diary')
export class TeacherClassDiaryController {
    constructor(private readonly classDiaryService: TeacherClassDiaryService) { }

    @ApiOperation({ summary: 'Create a new class diary entry' })
    @Post()
    create(@Request() req, @Body() dto: CreateClassDiaryDto) {
        const schoolId = req.user.schoolId;
        const userId = req.user.id;
        const academicYearId = req.user.academicYearId;
        return this.classDiaryService.create(schoolId, userId, academicYearId, dto);
    }

    @ApiOperation({ summary: 'Get all class diary entries (with filters)' })
    @Get()
    findAll(@Request() req, @Query() query: ClassDiaryQueryDto) {
        const schoolId = req.user.schoolId;
        const userId = req.user.id;
        const academicYearId = req.user.academicYearId;
        return this.classDiaryService.findAll(schoolId, userId, academicYearId, query);
    }

    @ApiOperation({ summary: 'Get a specific class diary entry' })
    @Get(':id')
    findOne(@Request() req, @Param('id') id: string) {
        const schoolId = req.user.schoolId;
        const userId = req.user.id;
        return this.classDiaryService.findOne(schoolId, userId, +id);
    }

    @ApiOperation({ summary: 'Update a class diary entry' })
    @Patch(':id')
    update(@Request() req, @Param('id') id: string, @Body() dto: UpdateClassDiaryDto) {
        const schoolId = req.user.schoolId;
        const userId = req.user.id;
        return this.classDiaryService.update(schoolId, userId, +id, dto);
    }

    @ApiOperation({ summary: 'Delete a class diary entry' })
    @Delete(':id')
    remove(@Request() req, @Param('id') id: string) {
        const schoolId = req.user.schoolId;
        const userId = req.user.id;
        return this.classDiaryService.remove(schoolId, userId, +id);
    }
}
