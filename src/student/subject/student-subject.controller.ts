import { Controller, Get, Param, ParseIntPipe, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserAuthGuard } from '../../common/guards/user.guard';
import { StudentSubjectService } from './student-subject.service';

@ApiTags('Student - Subjects')
@ApiBearerAuth()
@Controller('student/subjects')
@UseGuards(UserAuthGuard)
export class StudentSubjectController {
    constructor(private readonly subjectService: StudentSubjectService) { }

    @ApiOperation({ summary: 'Get all subjects assigned to the student' })
    @Get()
    findAll(@Request() req) {
        const schoolId = req.user.schoolId;
        const studentUserId = req.user.id;
        return this.subjectService.findAll(schoolId, studentUserId);
    }

    @ApiOperation({ summary: 'Get details of a specific subject assignment' })
    @Get(':assignmentId')
    findOne(
        @Request() req,
        @Param('assignmentId', ParseIntPipe) assignmentId: number
    ) {
        const schoolId = req.user.schoolId;
        const studentUserId = req.user.id;
        return this.subjectService.findOne(schoolId, studentUserId, assignmentId);
    }
}
