import { Controller, Get, Post, Body, Req, UseGuards, Query, ParseIntPipe, Patch, Delete, Param } from '@nestjs/common';
import { SectionService } from './section.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { Audit } from '../../common/audit/audit.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';

import { BulkCreateSectionDto } from './dto/bulk-create-section.dto';

@ApiTags('Section')
@Controller('principal/sections')
@UseGuards(PrincipalAuthGuard)
@Audit('Section')
export class SectionController {
    constructor(private readonly sectionService: SectionService) { }

    @Get()
    @ApiOperation({ summary: 'List all sections' })
    @ApiQuery({ name: 'classId', required: false, type: Number })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiResponse({ status: 200, description: 'Return all sections.' })
    async findAll(
        @Req() req,
        @Query('classId', new ParseIntPipe({ optional: true })) classId?: number,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
    ) {
        const schoolId = req.user.schoolId;
        const pageNumber = page ? +page : 1;
        const limitNumber = limit ? +limit : 10;
        return this.sectionService.findAll(schoolId, classId, pageNumber, limitNumber);
    }

    @Get('template')
    @ApiOperation({ summary: 'Get section creation template' })
    @ApiResponse({ status: 200, description: 'Return template for bulk creation.' })
    async getTemplate() {
        return this.sectionService.getTemplate();
    }

    @Post()
    @ApiOperation({ summary: 'Create a section' })
    @ApiResponse({ status: 201, description: 'The section has been successfully created.' })
    async create(@Req() req, @Body() createSectionDto: CreateSectionDto) {
        const schoolId = req.user.schoolId;
        return this.sectionService.create(schoolId, createSectionDto);
    }

    @Post('bulk')
    @ApiOperation({ summary: 'Bulk create sections' })
    @ApiResponse({ status: 201, description: 'Sections have been successfully created.' })
    async createBulk(@Req() req, @Body() dto: BulkCreateSectionDto) {
        const schoolId = req.user.schoolId;
        return this.sectionService.createBulk(schoolId, dto);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a section by id' })
    @ApiResponse({ status: 200, description: 'Return the section.' })
    async findOne(@Req() req, @Param('id', ParseIntPipe) id: number) {
        const schoolId = req.user.schoolId;
        return this.sectionService.findOne(schoolId, id);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update a section' })
    @ApiResponse({ status: 200, description: 'The section has been successfully updated.' })
    async update(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Body() updateSectionDto: UpdateSectionDto,
    ) {
        const schoolId = req.user.schoolId;
        return this.sectionService.update(schoolId, id, updateSectionDto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a section' })
    @ApiResponse({ status: 200, description: 'The section has been successfully deleted.' })
    async remove(@Req() req, @Param('id', ParseIntPipe) id: number) {
        const schoolId = req.user.schoolId;
        return this.sectionService.remove(schoolId, id);
    }
}
