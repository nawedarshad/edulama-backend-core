import {
    Controller,
    Get,
    Post,
    Delete,
    Body,
    Param,
    ParseIntPipe,
    Query,
    UseGuards,
} from '@nestjs/common';
import { PrincipalDiaryService } from './principal-diary.service';
import { GetUser } from '../../common/decorators/get-user.decorator';
import type { User } from '@prisma/client';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { PrincipalDiaryQueryDto } from './dto/principal-diary-query.dto';
import { CreatePrincipalDiaryDto } from './dto/create-principal-diary.dto';

interface ExtendedUser extends User {
    academicYearId: number;
}

@UseGuards(PrincipalAuthGuard)
@Controller('principal/class-diaries')
export class PrincipalDiaryController {
    constructor(private readonly diaryService: PrincipalDiaryService) { }

    @Get()
    findAll(@GetUser() user: ExtendedUser, @Query() query: PrincipalDiaryQueryDto) {
        return this.diaryService.findAll(user.schoolId, query);
    }

    @Get(':id')
    findOne(@GetUser() user: ExtendedUser, @Param('id', ParseIntPipe) id: number) {
        return this.diaryService.findOne(user.schoolId, id);
    }

    @Post()
    create(@GetUser() user: ExtendedUser, @Body() dto: CreatePrincipalDiaryDto) {
        return this.diaryService.create(user.schoolId, user.academicYearId, dto, user.id);
    }

    @Delete(':id')
    remove(@GetUser() user: ExtendedUser, @Param('id', ParseIntPipe) id: number) {
        return this.diaryService.remove(user.schoolId, id);
    }
}
