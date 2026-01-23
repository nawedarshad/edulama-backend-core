import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
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
}
