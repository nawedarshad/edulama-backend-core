import { Controller, Get, Param, ParseIntPipe, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserAuthGuard } from '../../common/guards/user.guard';
import { ParentSubjectService } from './parent-subject.service';

@ApiTags('Parent - Subjects')
@ApiBearerAuth()
@Controller('parent/subjects')
@UseGuards(UserAuthGuard)
export class ParentSubjectController {
    constructor(private readonly subjectService: ParentSubjectService) { }

    @ApiOperation({ summary: 'Get all subjects assigned to a student' })
    @Get(':studentId')
    findAll(
        @Request() req,
        @Param('studentId', ParseIntPipe) studentId: number
    ) {
        const schoolId = req.user.schoolId;
        const parentUserId = req.user.id;
        return this.subjectService.findAll(schoolId, parentUserId, studentId);
    }

    @ApiOperation({ summary: 'Get details of a specific subject assignment' })
    @Get(':studentId/:assignmentId')
    findOne(
        @Request() req,
        @Param('studentId', ParseIntPipe) studentId: number,
        @Param('assignmentId', ParseIntPipe) assignmentId: number
    ) {
        const schoolId = req.user.schoolId;
        const parentUserId = req.user.id;
        return this.subjectService.findOne(schoolId, parentUserId, studentId, assignmentId);
    }
}
