import { Controller, Get, Param, ParseIntPipe, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiQuery } from '@nestjs/swagger';
import { UserAuthGuard } from '../../common/guards/user.guard';
import { ParentClassDiaryService } from './parent-class-diary.service';

@ApiTags('Parent - Class Diary')
@ApiBearerAuth()
@Controller('parent/diary')
@UseGuards(UserAuthGuard)
export class ParentClassDiaryController {
    constructor(private readonly diaryService: ParentClassDiaryService) { }

    @ApiOperation({ summary: 'Get all diary logs for a specific date' })
    @Get(':studentId/daily')
    getDailyDiaryLogs(
        @Request() req,
        @Param('studentId', ParseIntPipe) studentId: number,
        @Query('date') date: string
    ) {
        const schoolId = req.user.schoolId;
        const parentUserId = req.user.id;
        const academicYearId = req.user.academicYearId;

        const targetDate = date || new Date().toISOString().split('T')[0];

        return this.diaryService.getDailyDiaryLogs(
            schoolId,
            parentUserId,
            studentId,
            academicYearId,
            targetDate
        );
    }

    @ApiOperation({ summary: 'Get list of diary logs for a specific subject' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'limit', required: false })
    @Get(':studentId/subject/:subjectId')
    getSubjectDiaryLogs(
        @Request() req,
        @Param('studentId', ParseIntPipe) studentId: number,
        @Param('subjectId', ParseIntPipe) subjectId: number,
        @Query('page') page?: number,
        @Query('limit') limit?: number
    ) {
        const schoolId = req.user.schoolId;
        const parentUserId = req.user.id;
        const academicYearId = req.user.academicYearId;
        return this.diaryService.getSubjectDiaryLogs(
            schoolId,
            parentUserId,
            studentId,
            subjectId,
            academicYearId,
            page ? +page : 1,
            limit ? +limit : 20
        );
    }

    @ApiOperation({ summary: 'Get details of a specific diary entry' })
    @Get(':studentId/entry/:diaryId')
    getDiaryEntryDetails(
        @Request() req,
        @Param('studentId', ParseIntPipe) studentId: number,
        @Param('diaryId', ParseIntPipe) diaryId: number
    ) {
        const schoolId = req.user.schoolId;
        const parentUserId = req.user.id;
        return this.diaryService.getDiaryEntryDetails(schoolId, parentUserId, studentId, diaryId);
    }
}
