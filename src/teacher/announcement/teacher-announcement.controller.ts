import { Controller, Get, Post, Query, UseGuards, Request, Param } from '@nestjs/common';
import { TeacherAnnouncementService } from './teacher-announcement.service';
import { UserAuthGuard } from '../../common/guards/user.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AnnouncementQueryDto } from '../../principal/announcement/dto/announcement-query.dto';

import { RequiredModule } from '../../common/decorators/required-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';

@ApiTags('Teacher - Announcements')
@ApiBearerAuth()
@UseGuards(UserAuthGuard, ModuleGuard)
@RequiredModule('ANNOUNCEMENTS')
@Controller('teacher/announcements')
export class TeacherAnnouncementController {
    constructor(private readonly announcementService: TeacherAnnouncementService) { }

    @Get()
    @ApiOperation({ summary: 'Get announcements targeted at teachers' })
    findAll(@Request() req, @Query() query: AnnouncementQueryDto) {
        return this.announcementService.findAll(req.user.schoolId, req.user.id, query);
    }

    @Post(':id/read')
    @ApiOperation({ summary: 'Mark announcement as read' })
    markAsRead(@Request() req, @Param('id') id: string) {
        return this.announcementService.markAsRead(req.user.schoolId, req.user.id, +id);
    }
}
