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
import { PrincipalNoticeService } from './principal-notice.service';
import { GetUser } from '../../common/decorators/get-user.decorator';
import type { User } from '@prisma/client';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { PrincipalNoticeQueryDto } from './dto/principal-notice-query.dto';
import { CreatePrincipalNoticeDto } from './dto/create-principal-notice.dto';

import { RequiredModule } from '../../common/decorators/required-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';

@UseGuards(PrincipalAuthGuard, ModuleGuard)
@RequiredModule('NOTICES')
@Controller('principal/notices')
export class PrincipalNoticeController {
    constructor(private readonly noticeService: PrincipalNoticeService) { }

    @Post()
    create(@GetUser() user: User, @Body() dto: CreatePrincipalNoticeDto) {
        return this.noticeService.create(user.schoolId, user.id, dto);
    }

    @Get()
    findAll(@GetUser() user: User, @Query() query: PrincipalNoticeQueryDto) {
        return this.noticeService.findAll(user.schoolId, query);
    }

    @Get('stats')
    getStats(@GetUser() user: User) {
        return this.noticeService.getStats(user.schoolId);
    }

    @Get(':id')
    findOne(@GetUser() user: User, @Param('id', ParseIntPipe) id: number) {
        return this.noticeService.findOne(user.schoolId, id);
    }

    @Delete(':id')
    remove(@GetUser() user: User, @Param('id', ParseIntPipe) id: number) {
        return this.noticeService.remove(user.schoolId, id);
    }
}
