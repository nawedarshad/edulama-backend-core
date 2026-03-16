import { Controller, Get, Post, Query, UseGuards, Request, Param, ParseIntPipe } from '@nestjs/common';
import { StudentAnnouncementService } from './student-announcement.service';
import { StudentAuthGuard } from '../../common/guards/student.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AnnouncementQueryDto } from '../../principal/announcement/dto/announcement-query.dto';

@ApiTags('Student - Announcements')
@ApiBearerAuth()
@UseGuards(StudentAuthGuard)
@Controller('student/announcements')
export class StudentAnnouncementController {
    constructor(private readonly announcementService: StudentAnnouncementService) { }

    @Get()
    @ApiOperation({ summary: 'Get announcements targeted at students' })
    findAll(@Request() req, @Query() query: AnnouncementQueryDto) {
        return this.announcementService.findAll(req.user.schoolId, req.user.id, query);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get single announcement' })
    findOne(@Request() req, @Param('id', ParseIntPipe) id: number) {
        return this.announcementService.findOne(req.user.schoolId, req.user.id, id);
    }

    @Post(':id/read')
    @ApiOperation({ summary: 'Mark announcement as read' })
    markAsRead(@Request() req, @Param('id', ParseIntPipe) id: number) {
        return this.announcementService.markAsRead(req.user.schoolId, req.user.id, id);
    }
}
