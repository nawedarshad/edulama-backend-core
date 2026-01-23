import { Controller, Get, UseGuards, Request, UnauthorizedException, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { UserAuthGuard } from '../../common/guards/user.guard';
import { TeacherSectionService } from './section.service';

@ApiTags('Teacher - Sections')
@ApiBearerAuth()
@Controller('teacher/sections')
@UseGuards(UserAuthGuard)
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
        if (req.user.role !== 'TEACHER') {
            throw new UnauthorizedException('Access denied. Teachers only.');
        }
        return this.sectionService.findAll(req.user.schoolId, classId);
    }
}
