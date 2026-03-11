import { Controller, Get, UseGuards, Request, UnauthorizedException, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { TeacherAuthGuard } from '../../common/guards/teacher.guard';
import { TeacherSectionService } from './section.service';

@ApiTags('Teacher - Sections')
@ApiBearerAuth()
@Controller('teacher/sections')
@UseGuards(TeacherAuthGuard)
export class TeacherSectionController {
    constructor(private readonly sectionService: TeacherSectionService) { }

    @Get()
    @ApiOperation({ summary: 'Get sections for a class (Minimal)' })
    @ApiQuery({ name: 'classId', required: true, type: Number })
    @ApiResponse({ status: 200, description: 'List of sections' })
    async findAll(
        @Request() req,
        @Query('classId', ParseIntPipe) classId: number
    ) {
        return this.sectionService.findAll(req.user.schoolId, classId);
    }
}
