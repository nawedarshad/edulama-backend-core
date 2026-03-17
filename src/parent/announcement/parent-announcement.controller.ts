import { Controller, Get, Post, Query, UseGuards, Request, Param, ParseIntPipe } from '@nestjs/common';
import { ParentAnnouncementService } from './parent-announcement.service';
import { ParentAuthGuard } from '../../common/guards/parent.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AnnouncementQueryDto } from '../../principal/announcement/dto/announcement-query.dto';

@ApiTags('Parent - Announcements')
@ApiBearerAuth()
@UseGuards(ParentAuthGuard)
@Controller('parent/announcements')
export class ParentAnnouncementController {
    constructor(private readonly announcementService: ParentAnnouncementService) { }

    @Get(':studentId')
    @ApiOperation({ summary: 'Get announcements targeted at parents' })
    findAll(
        @Request() req, 
        @Param('studentId', ParseIntPipe) studentId: number,
        @Query() query: AnnouncementQueryDto & { viewMode?: string }
    ) {
        return this.announcementService.findAll(req.user.schoolId, req.user.id, studentId, query);
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
