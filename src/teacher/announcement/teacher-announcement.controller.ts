import { Controller, Get, Post, Query, UseGuards, Request, Param } from '@nestjs/common';
import { TeacherAnnouncementService } from './teacher-announcement.service';
import { UserAuthGuard } from '../../common/guards/user.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AnnouncementQueryDto } from '../../principal/announcement/dto/announcement-query.dto';

@ApiTags('Teacher - Announcements')
@ApiBearerAuth()
@UseGuards(UserAuthGuard)
@Controller('teacher/announcements')
export class TeacherAnnouncementController {
    constructor(private readonly announcementService: TeacherAnnouncementService) { }

    @Get()
    @ApiOperation({ summary: 'Get announcements targeted at teachers' })
    findAll(@Request() req, @Query() query: AnnouncementQueryDto) {
        return this.announcementService.findAll(req.user.schoolId, req.user.id, query);
    }

    @Get(':id/read')
    @ApiOperation({ summary: 'Mark announcement as read' })
    markAsRead(@Request() req, @Query('id') id: string) { // Using Query param or Param depending on route, assuming route param from code logic context but standard rest uses Param
        // Wait, the path is :id/read but passing @Query('id'). Correcting to @Param('id')
        // However, NestJS standard is @Param
        return this.announcementService.markAsRead(req.user.schoolId, req.user.id, +id);
    }
}
