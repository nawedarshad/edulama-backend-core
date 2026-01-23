import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    Query,
    UseGuards,
    ParseIntPipe,
} from '@nestjs/common';
import { PrincipalAnnouncementService } from './principal-announcement.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';

import { AnnouncementQueryDto } from './dto/announcement-query.dto';
import { GetUser } from '../../common/decorators/get-user.decorator';
import type { User } from '@prisma/client';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
// import { JwtAuthGuard } from '../../auth/guard/jwt-auth.guard'; // Not found
// import { RolesGuard } from '../../auth/guard/roles.guard'; // Not found
// import { Roles } from '../../auth/decorator/roles.decorator'; // Not found

@UseGuards(PrincipalAuthGuard)
// @Roles('PRINCIPAL', 'ADMIN', 'DIRECTOR') // PrincipalAuthGuard enforces Principal role
@Controller('principal/announcements')
export class PrincipalAnnouncementController {
    constructor(private readonly announcementService: PrincipalAnnouncementService) { }

    @Post()
    create(
        @GetUser() user: User,
        @Body() createAnnouncementDto: CreateAnnouncementDto,
    ) {
        return this.announcementService.create(
            user.schoolId,
            user.id,
            createAnnouncementDto,
        );
    }

    @Get()
    findAll(
        @GetUser() user: User,
        @Query() query: AnnouncementQueryDto,
    ) {
        return this.announcementService.findAll(user.schoolId, query);
    }

    @Get('stats')
    getStats(
        @GetUser() user: User,
        @Query('academicYearId', new ParseIntPipe({ optional: true })) academicYearId?: number,
    ) {
        return this.announcementService.getStats(user.schoolId, academicYearId);
    }

    @Get(':id')
    findOne(
        @GetUser() user: User,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.announcementService.findOne(user.schoolId, id);
    }



    @Delete(':id')
    remove(
        @GetUser() user: User,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.announcementService.remove(user.schoolId, id);
    }
}
