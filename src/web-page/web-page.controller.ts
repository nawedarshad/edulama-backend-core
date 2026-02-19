
import { Controller, Get, Post, Body, Param, Delete, Put, UseGuards, Request, Query } from '@nestjs/common';
import { WebPageService } from './web-page.service';
import { UserAuthGuard } from '../common/guards/user.guard';

@Controller('web-pages')
export class WebPageController {
    constructor(private readonly webPageService: WebPageService) { }

    @UseGuards(UserAuthGuard)
    @Post()
    create(@Request() req, @Body() data: any) {
        const schoolId = req.user.schoolId;
        return this.webPageService.create(schoolId, data);
    }

    @UseGuards(UserAuthGuard)
    @Get()
    findAll(@Request() req) {
        const schoolId = req.user.schoolId;
        return this.webPageService.findAll(schoolId);
    }

    // Public endpoint for rendering
    @Get('public/:subdomain/:slug')
    findBySlug(@Param('subdomain') subdomain: string, @Param('slug') slug: string) {
        return this.webPageService.findBySlug(subdomain, slug);
    }

    @UseGuards(UserAuthGuard)
    @Get(':id')
    findOne(@Request() req, @Param('id') id: string) {
        const schoolId = req.user.schoolId;
        return this.webPageService.findOne(schoolId, +id);
    }

    @UseGuards(UserAuthGuard)
    @Put(':id')
    update(@Request() req, @Param('id') id: string, @Body() data: any) {
        const schoolId = req.user.schoolId;
        return this.webPageService.update(schoolId, +id, data);
    }

    @UseGuards(UserAuthGuard)
    @Delete(':id')
    remove(@Request() req, @Param('id') id: string) {
        const schoolId = req.user.schoolId;
        return this.webPageService.remove(schoolId, +id);
    }
}
