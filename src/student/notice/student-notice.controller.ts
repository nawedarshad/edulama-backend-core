import {
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { StudentNoticeService } from './student-notice.service';
import { GetUser } from '../../common/decorators/get-user.decorator';
import type { User } from '@prisma/client';
import { StudentAuthGuard } from '../../common/guards/student.guard';
import { StudentNoticeQueryDto } from './dto/student-notice-query.dto';

@UseGuards(StudentAuthGuard)
@Controller('student/notices')
export class StudentNoticeController {
    constructor(private readonly noticeService: StudentNoticeService) { }

    @Get()
    findAll(@GetUser() user: User, @Query() query: StudentNoticeQueryDto) {
        return this.noticeService.findAll(user.schoolId, user.id, query);
    }

    @Get(':id')
    findOne(@GetUser() user: User, @Param('id', ParseIntPipe) id: number) {
        return this.noticeService.findOne(user.schoolId, user.id, id);
    }

    @Post(':id/acknowledge')
    acknowledge(@GetUser() user: User, @Param('id', ParseIntPipe) id: number) {
        return this.noticeService.acknowledge(user.schoolId, user.id, id);
    }
}
