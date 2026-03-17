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
import type { AuthUserPayload } from '../../common/decorators/get-user.decorator';
import { ParentAuthGuard } from '../../common/guards/parent.guard';
import { ParentNoticeQueryDto } from './dto/parent-notice-query.dto';

@UseGuards(ParentAuthGuard)
@Controller('parent/notices')
export class ParentNoticeController {
    constructor(private readonly noticeService: ParentNoticeService) { }

    @Get(':studentId')
    findAll(
        @GetUser() user: AuthUserPayload, 
        @Param('studentId', ParseIntPipe) studentId: number,
        @Query() query: Omit<ParentNoticeQueryDto, 'studentId'>
    ) {
        return this.noticeService.findAll(user.schoolId, user.id, studentId, query);
    }

    @Get(':studentId/:id')
    findOne(
        @GetUser() user: AuthUserPayload,
        @Param('studentId', ParseIntPipe) studentId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.noticeService.findOne(user.schoolId, user.id, id, studentId);
    }

    @Post(':studentId/:id/acknowledge')
    acknowledge(
        @GetUser() user: AuthUserPayload,
        @Param('studentId', ParseIntPipe) studentId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.noticeService.acknowledge(user.schoolId, user.id, id, studentId);
    }
}
