import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { TeacherNoticeService } from './teacher-notice.service';
import { GetUser } from '../../common/decorators/get-user.decorator';
import type { AuthUserPayload } from '../../common/decorators/get-user.decorator';
import { TeacherAuthGuard } from '../../common/guards/teacher.guard';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { NoticeQueryDto } from './dto/notice-query.dto';

import { RequiredModule } from '../../common/decorators/required-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';

@UseGuards(TeacherAuthGuard, ModuleGuard)
@RequiredModule('NOTICES')
@Controller('teacher/notices')
export class TeacherNoticeController {
    constructor(private readonly noticeService: TeacherNoticeService) { }

    @Get('contexts')
    getAuthorizedContexts(@GetUser() user: AuthUserPayload) {
        return this.noticeService.getAuthorizedContexts(user.schoolId, user.id);
    }

    @Post()
    create(@GetUser() user: AuthUserPayload, @Body() dto: CreateNoticeDto) {
        return this.noticeService.create(user.schoolId, user.id, dto);
    }

    @Get()
    findAll(@GetUser() user: AuthUserPayload, @Query() query: NoticeQueryDto) {
        return this.noticeService.findAll(user.schoolId, user.id, query);
    }

    @Get(':id')
    findOne(@GetUser() user: AuthUserPayload, @Param('id', ParseIntPipe) id: number) {
        return this.noticeService.findOne(user.schoolId, user.id, id);
    }

    @Delete(':id')
    remove(@GetUser() user: AuthUserPayload, @Param('id', ParseIntPipe) id: number) {
        return this.noticeService.remove(user.schoolId, user.id, id);
    }
}
