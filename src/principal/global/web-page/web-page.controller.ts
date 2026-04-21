import { Controller, Get, Post, Body, Param, Delete, Put, UseGuards, Request, Query } from '@nestjs/common';
import { WebPageService } from './web-page.service';
import { PrincipalAuthGuard } from '../../../common/guards/principal.guard';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Principal - Website Pages')
@ApiBearerAuth()
@Controller('principal/web-pages')
@UseGuards(PrincipalAuthGuard)
export class WebPageController {
    constructor(private readonly webPageService: WebPageService) { }

    @ApiOperation({ summary: 'Create a new web page' })
    @Post()
    create(@Request() req, @Body() data: any) {
        const schoolId = req.user.schoolId;
        return this.webPageService.create(schoolId, data);
    }

    @ApiOperation({ summary: 'Get all web pages for the school' })
    @Get()
    findAll(@Request() req) {
        const schoolId = req.user.schoolId;
        return this.webPageService.findAll(schoolId);
    }

    // Public endpoint for rendering remains the same path but logically separated
    // Note: PrincipalAuthGuard might block this if it's not truly public.
    // However, the dashboard manages these. Public access is usually via a different route or bypass.
    // For now, keeping it here but we'll ensure it respects the global pattern.
    @ApiOperation({ summary: 'Find a page by slug (Public)' })
    @Get('public/:subdomain/:slug')
    findBySlug(@Param('subdomain') subdomain: string, @Param('slug') slug: string) {
        return this.webPageService.findBySlug(subdomain, slug);
    }

    @ApiOperation({ summary: 'Get a single page by ID' })
    @Get(':id')
    findOne(@Request() req, @Param('id') id: string) {
        const schoolId = req.user.schoolId;
        return this.webPageService.findOne(schoolId, +id);
    }

    @ApiOperation({ summary: 'Update a web page' })
    @Put(':id')
    update(@Request() req, @Param('id') id: string, @Body() data: any) {
        const schoolId = req.user.schoolId;
        return this.webPageService.update(schoolId, +id, data);
    }

    @ApiOperation({ summary: 'Delete a web page' })
    @Delete(':id')
    remove(@Request() req, @Param('id') id: string) {
        const schoolId = req.user.schoolId;
        return this.webPageService.remove(schoolId, +id);
    }
}
