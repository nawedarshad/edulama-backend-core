import {
    Body,
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ParentNoticeService } from './parent-notice.service';
import { GetUser } from '../../common/decorators/get-user.decorator';
import type { User } from '@prisma/client';
import { ParentAuthGuard } from '../../common/guards/parent.guard';
import { ParentNoticeQueryDto } from './dto/parent-notice-query.dto';

@UseGuards(ParentAuthGuard)
@Controller('parent/notices')
export class ParentNoticeController {
    constructor(private readonly noticeService: ParentNoticeService) { }

    @Get()
    findAll(@GetUser() user: User, @Query() query: ParentNoticeQueryDto) {
        return this.noticeService.findAll(user.schoolId, user.id, query);
    }

    @Get(':id')
    findOne(
        @GetUser() user: User,
        @Param('id', ParseIntPipe) id: number,
        @Query('studentId', ParseIntPipe) studentId: number
    ) {
        return this.noticeService.findOne(user.schoolId, user.id, id, studentId);
    }

    @Post(':id/acknowledge')
    acknowledge(
        @GetUser() user: User,
        @Param('id', ParseIntPipe) id: number,
        @Body('studentId', ParseIntPipe) studentId: number
    ) {
        return this.noticeService.acknowledge(user.schoolId, user.id, id, studentId);
    }
}
